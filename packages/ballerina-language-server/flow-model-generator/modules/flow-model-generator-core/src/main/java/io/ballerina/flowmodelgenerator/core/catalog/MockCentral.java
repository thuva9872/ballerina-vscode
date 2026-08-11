/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.catalog;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchResult;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A mock of the Ballerina Central library-catalog API. It serves a curated set of <b>real, resolvable</b> library
 * modules grouped into sources (Standard Library / Current Organization / Community), so the "Add library" browse
 * experience can be developed before the real Central "list all libraries" API exists.
 *
 * <p>The bucket-to-module assignment is read from {@code library_catalog.json}; the actual function data (names,
 * descriptions, coordinates) is pulled from the local search index via {@link SearchDatabaseManager}, which
 * guarantees the coordinates resolve for the downstream node-template / import pipeline.</p>
 *
 * <p><b>Swap point:</b> when the Ballerina Central listing API is available, replace this provider with a
 * {@code RemoteCentral}-backed implementation. The RPC contract and the webview remain unchanged.</p>
 *
 * @since 1.0.0
 */
public class MockCentral {

    private static final String CATALOG_RESOURCE = "library_catalog.json";
    private static final int MAX_FUNCTIONS_PER_MODULE = 60;

    public static final String SOURCE_BALLERINA = "BALLERINA";
    public static final String SOURCE_ORGANIZATION = "ORGANIZATION";
    public static final String SOURCE_COMMUNITY = "COMMUNITY";
    public static final String SOURCE_ALL = "ALL";

    private final Map<String, List<String>> catalogConfig;

    private static final class Holder {

        private static final MockCentral INSTANCE = new MockCentral();
    }

    public static MockCentral getInstance() {
        return Holder.INSTANCE;
    }

    private MockCentral() {
        this.catalogConfig = loadConfig();
    }

    private static Map<String, List<String>> loadConfig() {
        InputStream stream = MockCentral.class.getClassLoader().getResourceAsStream(CATALOG_RESOURCE);
        if (stream == null) {
            throw new IllegalArgumentException("Resource not found: " + CATALOG_RESOURCE);
        }
        try (JsonReader reader = new JsonReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            Map<String, List<String>> config =
                    new Gson().fromJson(reader, new TypeToken<Map<String, List<String>>>() { }.getType());
            return config == null ? Map.of() : config;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Builds the library catalog grouped by source. Each returned {@link Category} is a source (Standard Library /
     * Current Organization / Community) whose items are module {@link Category}s, each carrying its function nodes
     * and an {@code imported} flag in the metadata.
     *
     * @param source          the requested source ({@code ALL}, {@code BALLERINA}, {@code ORGANIZATION},
     *                        {@code COMMUNITY})
     * @param query           free-text query matched against module name, function name and description (empty = all)
     * @param importedModules module names already present as project dependencies (used for the imported flag)
     * @return the list of source categories
     */
    public List<Category> getCatalog(String source, String query, List<String> importedModules) {
        String normalizedSource = source == null ? SOURCE_ALL : source.toUpperCase(Locale.ROOT);
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<Category> sources = new ArrayList<>();

        if (matchesSource(normalizedSource, SOURCE_BALLERINA)) {
            addSource(sources, Category.Name.STANDARD_LIBRARY, "ballerina", normalizedQuery, importedModules);
        }
        if (matchesSource(normalizedSource, SOURCE_ORGANIZATION)) {
            addSource(sources, Category.Name.CURRENT_ORGANIZATION, "organization", normalizedQuery, importedModules);
        }
        if (matchesSource(normalizedSource, SOURCE_COMMUNITY)) {
            addSource(sources, Category.Name.COMMUNITY, "community", normalizedQuery, importedModules);
        }
        return sources;
    }

    private static boolean matchesSource(String requested, String candidate) {
        return requested.equals(SOURCE_ALL) || requested.equals(candidate);
    }

    private void addSource(List<Category> sources, Category.Name sourceName, String configKey, String query,
                           List<String> importedModules) {
        List<String> moduleNames = catalogConfig.getOrDefault(configKey, List.of());
        List<Item> moduleCategories = new ArrayList<>();
        for (String moduleName : moduleNames) {
            Category moduleCategory = buildModuleCategory(moduleName, query, importedModules);
            if (moduleCategory != null) {
                moduleCategories.add(moduleCategory);
            }
        }
        if (moduleCategories.isEmpty()) {
            return;
        }
        Category sourceCategory = new Category.Builder(null).stepIn(sourceName).items(moduleCategories).build();
        sources.add(sourceCategory);
    }

    private Category buildModuleCategory(String moduleName, String query, List<String> importedModules) {
        List<SearchResult> functions = SearchDatabaseManager.getInstance()
                .searchFunctionsByPackages(List.of(moduleName), List.of(), MAX_FUNCTIONS_PER_MODULE, 0);

        boolean moduleMatchesQuery = query.isEmpty() || moduleName.toLowerCase(Locale.ROOT).contains(query);

        List<Item> nodes = new ArrayList<>();
        String org = null;
        String packageName = null;
        String version = null;
        for (SearchResult function : functions) {
            SearchResult.Package pkg = function.packageInfo();
            // searchFunctionsByPackages matches on the module name; keep only exact matches to be safe.
            if (!moduleName.equals(pkg.moduleName())) {
                continue;
            }
            if (!moduleMatchesQuery && !functionMatchesQuery(function, query)) {
                continue;
            }
            org = pkg.org();
            packageName = pkg.packageName();
            version = pkg.version();
            String icon = CommonUtils.generateIcon(pkg.org(), pkg.packageName(), pkg.version());
            Metadata metadata = new Metadata.Builder<>(null)
                    .label(function.name())
                    .description(function.description())
                    .icon(icon)
                    .build();
            Codedata codedata = new Codedata.Builder<>(null)
                    .node(NodeKind.FUNCTION_CALL)
                    .org(pkg.org())
                    .module(pkg.moduleName())
                    .packageName(pkg.packageName())
                    .symbol(function.name())
                    .version(pkg.version())
                    .build();
            nodes.add(new AvailableNode(metadata, codedata, true));
        }

        if (nodes.isEmpty()) {
            return null;
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("imported", importedModules.contains(moduleName));
        data.put("org", org);
        data.put("module", moduleName);
        Metadata moduleMetadata = new Metadata.Builder<>(null)
                .label(moduleName)
                .icon(CommonUtils.generateIcon(org, packageName, version))
                .data(data)
                .build();
        return new Category(moduleMetadata, nodes);
    }

    private static boolean functionMatchesQuery(SearchResult function, String query) {
        if (function.name() != null && function.name().toLowerCase(Locale.ROOT).contains(query)) {
            return true;
        }
        return function.description() != null && function.description().toLowerCase(Locale.ROOT).contains(query);
    }
}
