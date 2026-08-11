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

import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { Button, Codicon, SearchBox, SidePanelBody, ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import { BackIcon, CloseIcon, LogIcon } from "../../resources";
import { Category, Item, Node } from "../NodeList/types";
import { stripHtmlTags } from "../Form/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionsPanelProps {
    /** "Within Project" categories (current integration + workspace packages). */
    withinProject: Category[];
    /** "Imported Functions" categories (already-added dependency modules). */
    imported: Category[];
    /** Fired when a function pill is clicked — same contract as NodeList's onSelect. */
    onSelect: (id: string, metadata?: any) => void;
    /** Opens the Add library modal (dashed button + wider-catalog CTA). */
    onAddLibrary?: () => void;
    onClose?: () => void;
    onBack?: () => void;
    title?: string;
    searchPlaceholder?: string;
    loading?: boolean;
}

interface PanelModule {
    key: string;
    label: string;
    functions: Node[];
}

interface PanelGroup {
    key: "within" | "imported";
    title: string;
    modules: PanelModule[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isCategory = (item: Item): item is Category => "items" in item;
const isNode = (item: Item): item is Node => "id" in item && !("items" in item);

function collectNodes(category: Category): Node[] {
    const out: Node[] = [];
    for (const item of category.items ?? []) {
        if (isCategory(item)) {
            out.push(...collectNodes(item));
        } else if (isNode(item)) {
            out.push(item);
        }
    }
    return out;
}

/** Flatten a group's categories into module sub-labels + their function nodes. */
function toModules(categories: Category[]): PanelModule[] {
    const modules: PanelModule[] = [];
    for (const category of categories ?? []) {
        if (!category) {
            continue;
        }
        const subCategories = (category.items ?? []).filter(isCategory);
        const directNodes = (category.items ?? []).filter(isNode);
        if (subCategories.length) {
            for (const sub of subCategories) {
                const fns = collectNodes(sub);
                if (fns.length) {
                    modules.push({ key: `${category.title}/${sub.title}`, label: sub.title, functions: fns });
                }
            }
            if (directNodes.length) {
                modules.push({ key: category.title, label: category.title, functions: directNodes });
            }
        } else if (directNodes.length) {
            modules.push({ key: category.title, label: category.title, functions: directNodes });
        }
    }
    return modules;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FunctionsPanel(props: FunctionsPanelProps) {
    const {
        withinProject,
        imported,
        onSelect,
        onAddLibrary,
        onClose,
        onBack,
        title = "Functions",
        searchPlaceholder = "Search library functions",
        loading,
    } = props;

    const [query, setQuery] = useState("");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const searching = query.trim().length > 0;
    const q = query.trim().toLowerCase();

    const groups: PanelGroup[] = useMemo(
        () => [
            { key: "within", title: "Within Project", modules: toModules(withinProject) },
            { key: "imported", title: "Imported Functions", modules: toModules(imported) },
        ],
        [withinProject, imported]
    );

    const matchNode = (node: Node) =>
        !q || (node.label || "").toLowerCase().includes(q) || (node.description || "").toLowerCase().includes(q);

    const renderedGroups: PanelGroup[] = groups
        .map((g) => ({
            ...g,
            modules: g.modules
                .map((m) => ({ ...m, functions: m.functions.filter(matchNode) }))
                .filter((m) => m.functions.length > 0),
        }))
        .filter((g) => g.modules.length > 0);

    const anyResults = renderedGroups.length > 0;

    const tooltipContent = (description?: string): React.ReactNode | undefined => {
        const cleaned = stripHtmlTags(description || "").trim();
        if (!cleaned) {
            return undefined;
        }
        return (
            <S.TooltipMd>
                <ReactMarkdown>{cleaned}</ReactMarkdown>
            </S.TooltipMd>
        );
    };

    const handlePill = (node: Node, moduleLabel: string) => {
        if (node.enabled === false) {
            return;
        }
        onSelect(node.id, { node: node.metadata, category: moduleLabel });
    };

    const renderGroup = (group: PanelGroup) => {
        const isCollapsed = searching ? false : Boolean(collapsed[group.key]);
        return (
            <S.GroupBox key={group.key}>
                <S.GroupHeader onClick={() => setCollapsed((c) => ({ ...c, [group.key]: !c[group.key] }))}>
                    <S.GroupTitle>{group.title}</S.GroupTitle>
                    <S.Chevron collapsed={isCollapsed}>
                        <Codicon name="chevron-up" />
                    </S.Chevron>
                </S.GroupHeader>
                {!isCollapsed && (
                    <S.GroupBody>
                        {group.modules.map((module) => (
                            <S.Module key={module.key}>
                                <S.ModuleLabel>{module.label}</S.ModuleLabel>
                                <S.Grid>
                                    {module.functions.map((node, index) => (
                                        <Tooltip
                                            key={module.key + node.label + index}
                                            content={tooltipContent(node.description)}
                                            position="bottom"
                                            offset={{ top: 16, left: 20 }}
                                            sx={{
                                                maxWidth: "280px",
                                                whiteSpace: "normal",
                                                wordWrap: "break-word",
                                                overflowWrap: "break-word",
                                            }}
                                        >
                                            <S.Pill
                                                enabled={node.enabled !== false}
                                                onClick={() => handlePill(node, module.label)}
                                            >
                                                <S.PillIcon>{node.icon || <LogIcon />}</S.PillIcon>
                                                <S.PillTitle>{node.label}</S.PillTitle>
                                            </S.Pill>
                                        </Tooltip>
                                    ))}
                                </S.Grid>
                            </S.Module>
                        ))}
                    </S.GroupBody>
                )}
            </S.GroupBox>
        );
    };

    return (
        <S.Container>
            <S.Header>
                <S.HeaderRow>
                    {onBack && (
                        <S.LeftRow>
                            <S.BackButton appearance="icon" onClick={onBack}>
                                <BackIcon />
                            </S.BackButton>
                            <S.HeaderTitle>{title}</S.HeaderTitle>
                        </S.LeftRow>
                    )}
                    {onClose && (
                        <S.CloseButton appearance="icon" onClick={onClose}>
                            <CloseIcon />
                        </S.CloseButton>
                    )}
                </S.HeaderRow>
                <S.StyledSearchInput
                    value={query}
                    placeholder={searchPlaceholder}
                    autoFocus={true}
                    onChange={(value: string) => setQuery(value)}
                    size={60}
                />
                {onAddLibrary && !searching && (
                    <S.ImportButton onClick={onAddLibrary}>
                        <Codicon name="add" /> Import library
                    </S.ImportButton>
                )}
            </S.Header>
            <S.Body>
                {!loading && renderedGroups.map(renderGroup)}
                {!loading && searching && !anyResults && (
                    <S.NoResults>No library function matches “{query.trim()}”</S.NoResults>
                )}
                {!loading && searching && onAddLibrary && (
                    <S.WiderCta onClick={onAddLibrary}>
                        <S.WiderCtaMsg>Couldn't find the function you're looking for?</S.WiderCtaMsg>
                        <S.WiderCtaLink>
                            Search the wider catalog <Codicon name="arrow-right" />
                        </S.WiderCtaLink>
                    </S.WiderCta>
                )}
                {!loading && !searching && !anyResults && (
                    <S.Empty>No functions in this project yet. Use “+ Import library” to add one.</S.Empty>
                )}
            </S.Body>
        </S.Container>
    );
}

export default FunctionsPanel;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

namespace S {
    export const Container = styled.div`
        width: 100%;
    `;

    export const Header = styled.div`
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
    `;

    export const HeaderRow = styled.div`
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        width: 100%;
        min-height: 24px;
    `;

    export const LeftRow = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
    `;

    export const HeaderTitle = styled.div`
        font-size: 14px;
        font-family: GilmerBold;
        white-space: nowrap;
    `;

    export const BackButton = styled(Button)`
        border-radius: 5px;
    `;

    export const CloseButton = styled(Button)`
        position: absolute;
        right: 0;
        border-radius: 5px;
    `;

    export const StyledSearchInput = styled(SearchBox)`
        height: 30px;
    `;

    export const ImportButton = styled.div`
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        gap: 8px;
        padding: 7px 2px;
        color: ${ThemeColors.PRIMARY};
        border: 1px dashed ${ThemeColors.PRIMARY};
        border-radius: 5px;
        cursor: pointer;
        &:hover {
            border: 1px solid ${ThemeColors.PRIMARY};
            background-color: ${ThemeColors.PRIMARY_CONTAINER};
        }
    `;

    export const Body = styled(SidePanelBody)`
        height: calc(100vh - 150px);
        padding: 0 16px 16px;
        overflow-y: auto;
    `;

    export const GroupBox = styled.div`
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 8px;
        padding: 12px 14px;
        margin-bottom: 16px;
    `;

    export const GroupHeader = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
    `;

    export const GroupTitle = styled.div`
        font-size: 15px;
        font-family: GilmerBold;
    `;

    export const Chevron = styled.div<{ collapsed: boolean }>`
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        transition: transform 0.15s ease;
        transform: ${({ collapsed }) => (collapsed ? "rotate(180deg)" : "rotate(0deg)")};
    `;

    export const GroupBody = styled.div`
        margin-top: 8px;
    `;

    export const Module = styled.div`
        & + & {
            margin-top: 14px;
        }
    `;

    export const ModuleLabel = styled.div`
        font-size: 12px;
        font-weight: 600;
        opacity: 0.9;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        margin: 0 0 4px;
    `;

    export const Grid = styled.div`
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        width: 100%;
        margin-top: 4px;
    `;

    export const Pill = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        padding: 5px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 5px;
        height: 36px;
        cursor: ${({ enabled }) => (enabled ? "pointer" : "not-allowed")};
        font-size: 14px;
        min-width: 0;
        max-width: 100%;
        ${({ enabled }) => !enabled && "opacity: 0.5;"}
        &:hover {
            ${({ enabled }) =>
                enabled &&
                `
                background-color: ${ThemeColors.PRIMARY_CONTAINER};
                border: 1px solid ${ThemeColors.HIGHLIGHT};
            `}
        }
    `;

    export const PillIcon = styled.div`
        padding: 0 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        & svg {
            height: 16px;
            width: 16px;
        }
    `;

    export const PillTitle = styled.div`
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    export const TooltipMd = styled.div`
        font-size: 12px;
        line-height: 1.4;
        font-family: var(--vscode-font-family);
        p {
            margin: 0 0 6px 0;
        }
        p:last-of-type {
            margin-bottom: 0;
        }
        pre {
            display: none;
        }
        code {
            display: inline;
        }
    `;

    export const WiderCta = styled.div`
        margin-top: 4px;
        padding: 16px 14px;
        border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 10px;
        text-align: center;
        cursor: pointer;
        &:hover {
            background-color: ${ThemeColors.PRIMARY_CONTAINER};
        }
    `;

    export const WiderCtaMsg = styled.div`
        font-size: 13px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        margin-bottom: 7px;
    `;

    export const WiderCtaLink = styled.div`
        font-size: 14px;
        font-weight: 600;
        color: ${ThemeColors.PRIMARY};
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    `;

    export const NoResults = styled.div`
        padding: 16px 8px;
        text-align: center;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        font-size: 13px;
    `;

    export const Empty = styled.div`
        padding: 40px 8px;
        text-align: center;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        font-size: 13px;
    `;
}
