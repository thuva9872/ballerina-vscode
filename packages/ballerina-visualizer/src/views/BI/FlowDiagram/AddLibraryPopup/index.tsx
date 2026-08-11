/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AvailableNode, Category, Item, LibraryCatalogSource, LinePosition } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, ProgressRing, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { debounce } from "lodash";
import { ConnectorIcon } from "@wso2/bi-diagram";
import ButtonCard from "../../../../components/ButtonCard";
import { BackButton, CloseButton, PopupContainer, PopupHeader, PopupOverlay, PopupTitle } from "../../Connection/styles";
import {
    ConnectorsGrid,
    FilterButton,
    FilterButtons,
    PopupContent,
    SearchContainer,
    Section,
    SectionHeader,
    SectionTitle,
    StyledSearchBox,
} from "../../Connection/AddConnectionPopup/styles";

// The catalog browse mirrors the "Add Connection" modal: a centered popup with a search box, a
// [All / Standard / Organization / Community] source filter and a grid of library cards. Selecting a
// library drills into its functions; picking a function hands back to the caller to import (if needed)
// and open the configuration form.

type LibraryFilter = "All" | "Standard" | "Organization" | "Community";

const FILTERS: LibraryFilter[] = ["All", "Standard", "Organization", "Community"];

const FILTER_TO_SOURCE: Record<LibraryFilter, LibraryCatalogSource> = {
    All: "ALL",
    Standard: "BALLERINA",
    Organization: "ORGANIZATION",
    Community: "COMMUNITY",
};

interface LibraryModule {
    label: string;
    org: string;
    icon?: string;
    imported: boolean;
    functions: AvailableNode[];
}

interface LibrarySource {
    label: string;
    modules: LibraryModule[];
}

// source category -> module categories -> function nodes (see MockCentral.getCatalog on the LS side).
function normalizeCatalog(categories: Category[]): LibrarySource[] {
    return (categories ?? [])
        .map((source) => ({
            label: source?.metadata?.label ?? "",
            modules: ((source?.items ?? []) as Item[])
                .map((moduleItem) => {
                    const module = moduleItem as Category;
                    const data = (module?.metadata?.data ?? {}) as any;
                    const functions = ((module?.items ?? []) as Item[]).filter(
                        (item): item is AvailableNode => "codedata" in item
                    );
                    return {
                        label: module?.metadata?.label ?? (data.module as string) ?? "",
                        org: (data.org as string) ?? "",
                        icon: module?.metadata?.icon,
                        imported: Boolean(data.imported),
                        functions,
                    };
                })
                .filter((module) => module.functions.length > 0),
        }))
        .filter((source) => source.modules.length > 0);
}

export interface AddLibraryPopupProps {
    filePath: string;
    target?: LinePosition;
    onSelectFunction: (node: AvailableNode, imported: boolean) => void;
    onClose: () => void;
}

export function AddLibraryPopup(props: AddLibraryPopupProps) {
    const { filePath, onSelectFunction, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [searchText, setSearchText] = useState<string>("");
    const [filter, setFilter] = useState<LibraryFilter>("All");
    const [sources, setSources] = useState<LibrarySource[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectedModule, setSelectedModule] = useState<LibraryModule | null>(null);

    const fetchCatalog = useCallback(
        (query: string, activeFilter: LibraryFilter) => {
            setIsLoading(true);
            rpcClient
                .getBIDiagramRpcClient()
                .searchLibraryCatalog({
                    filePath,
                    source: FILTER_TO_SOURCE[activeFilter],
                    queryMap: query ? { q: query } : undefined,
                })
                .then((response) => {
                    setSources(normalizeCatalog((response?.categories as Category[]) ?? []));
                })
                .catch((error) => {
                    console.error(">>> searchLibraryCatalog failed", error);
                    setSources([]);
                })
                .finally(() => setIsLoading(false));
        },
        [rpcClient, filePath]
    );

    const debouncedFetch = useMemo(() => debounce(fetchCatalog, 1100), [fetchCatalog]);

    // Filter changes fetch immediately; search text is debounced (mirrors AddConnectionPopupContent).
    useEffect(() => {
        const query = searchText.trim();
        setIsLoading(true);
        if (query) {
            debouncedFetch(query, filter);
            return () => debouncedFetch.cancel();
        }
        debouncedFetch.cancel();
        fetchCatalog("", filter);
        return undefined;
    }, [searchText, filter, fetchCatalog, debouncedFetch]);

    const handleClose = () => {
        onClose();
    };

    const renderLibraries = () => (
        <>
            <SearchContainer>
                <StyledSearchBox
                    value={searchText}
                    placeholder="Search all libraries and functions"
                    onChange={(text: string) => setSearchText(text)}
                    size={60}
                />
            </SearchContainer>

            <Section>
                <SectionHeader>
                    <SectionTitle variant="h4">Libraries</SectionTitle>
                    <FilterButtons>
                        {FILTERS.map((option) => (
                            <FilterButton
                                key={option}
                                active={filter === option}
                                onClick={() => {
                                    setSelectedModule(null);
                                    setFilter(option);
                                }}
                            >
                                {option}
                            </FilterButton>
                        ))}
                    </FilterButtons>
                </SectionHeader>

                {isLoading && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "24px" }}>
                        <ProgressRing />
                    </div>
                )}

                {!isLoading &&
                    sources.map((source) => (
                        <Section key={source.label}>
                            {filter === "All" && <SectionTitle variant="h4">{source.label}</SectionTitle>}
                            <ConnectorsGrid>
                                {source.modules.map((module) => (
                                    <ButtonCard
                                        id={`library-${module.label.replace(/[ .]/g, "-").toLowerCase()}`}
                                        key={source.label + module.label}
                                        title={module.label}
                                        description={module.org ? `${module.org} / ${module.label}` : module.label}
                                        truncate={true}
                                        icon={
                                            module.icon ? (
                                                <ConnectorIcon url={module.icon} />
                                            ) : (
                                                <Codicon name="library" />
                                            )
                                        }
                                        onClick={() => setSelectedModule(module)}
                                    />
                                ))}
                            </ConnectorsGrid>
                        </Section>
                    ))}

                {!isLoading && sources.length === 0 && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                        <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                            No libraries found.
                        </Typography>
                    </div>
                )}
            </Section>
        </>
    );

    const renderFunctions = (module: LibraryModule) => (
        <Section>
            <SectionTitle variant="h4">{module.org ? `${module.org} / ${module.label}` : module.label}</SectionTitle>
            <ConnectorsGrid>
                {module.functions.map((fn) => (
                    <ButtonCard
                        id={`library-fn-${(fn.codedata?.symbol ?? fn.metadata.label).toLowerCase()}`}
                        key={(fn.codedata?.symbol ?? "") + fn.metadata.label}
                        title={fn.metadata.label}
                        description={fn.metadata.description || ""}
                        truncate={true}
                        icon={<Codicon name="symbol-method" />}
                        onClick={() => onSelectFunction(fn, module.imported)}
                    />
                ))}
            </ConnectorsGrid>
        </Section>
    );

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {selectedModule && (
                            <BackButton appearance="icon" onClick={() => setSelectedModule(null)}>
                                <Codicon name="arrow-left" />
                            </BackButton>
                        )}
                        <PopupTitle variant="h2">{selectedModule ? selectedModule.label : "Add library"}</PopupTitle>
                    </div>
                    <CloseButton appearance="icon" onClick={handleClose}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                <PopupContent>{selectedModule ? renderFunctions(selectedModule) : renderLibraries()}</PopupContent>
            </PopupContainer>
        </>
    );
}

export default AddLibraryPopup;
