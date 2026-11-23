import { CachedMetadata, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import {
    getBackgroundData,
    getClassChoiceData,
    getClassData,
    getExtraFeat,
    getFeatMapData,
    getRaceData,
    getSubclassData
} from '../../data';
import type DnDCharacterSheetHelperPlugin from '../../main';
import {
    createFrontmatterResolver,
    extractFrontmatterKey,
    flattenClassChoices,
    formatFeatureOrSlug,
    hasValidValue,
    normalizeFeatKey,
    parseBlockYaml,
    parseExtraFeatsList,
    parseJsonArrayProp,
    parseStringArray,
    parseWeaponMasteryState,
    serializeWeaponMasteryState
} from '../helpers';

export async function processDnDFeaturesBlock(
    plugin: DnDCharacterSheetHelperPlugin,
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
): Promise<void> {
    // 1. Create a Render Child to manage the lifecycle and reactivity
    const renderChild = new MarkdownRenderChild(el);
    ctx.addChild(renderChild);

    let activeRenderId = 0;
    let isUnloaded = false;
    let lastRenderedRevision = plugin.rulebookRevision;
    let pendingSelfSync: {
        updates: Record<string, string>;
        excludeKeys: string[];
        nonSyncSignature: string;
    } | null = null;
    let pendingSelfSyncTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPendingSelfSync = () => {
        pendingSelfSync = null;
        if (pendingSelfSyncTimer !== null) {
            clearTimeout(pendingSelfSyncTimer);
            pendingSelfSyncTimer = null;
        }
    };

    const getNonSyncSignature = (fm: Record<string, any> | undefined, excludeKeys: string[]): string => {
        if (!fm) return '';
        const excluded = new Set(excludeKeys);
        const entries = Object.keys(fm)
            .filter((key) => !excluded.has(key))
            .sort()
            .map((key) => [key, fm[key]]);
        try {
            return JSON.stringify(entries);
        } catch {
            return String(Date.now());
        }
    };

    renderChild.register(() => {
        isUnloaded = true;
        clearPendingSelfSync();
    });

    // 2. Wrap our entire rendering logic into a reusable function
    const renderContent = async (overrideCache?: CachedMetadata | null) => {
        if (isUnloaded) return;
        const myRenderId = ++activeRenderId;
        lastRenderedRevision = plugin.rulebookRevision;

        // Create a temporary wrapper to prevent UI flickering while awaiting data
        const wrapper = document.createElement('div');
        const commitWrapper = (): boolean => {
            if (isUnloaded || myRenderId !== activeRenderId) return false;
            el.empty();
            el.appendChild(wrapper);
            return true;
        };

        // Parse the user's code block using Obsidian's built-in YAML parser
        let blockData: Record<string, any>;
        try {
            blockData = parseBlockYaml(source);
        } catch (error) {
            wrapper.createEl("p", { text: "Error: Invalid format in dnd-features block.", cls: "dnd-error" });
            commitWrapper();
            return;
        }

        // 2. Fetch the frontmatter for the current active file
        const fileCache = overrideCache ?? plugin.app.metadataCache.getCache(ctx.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};

        // 3. Helper function to resolve "frontmatter.property" values
        const resolveValue = createFrontmatterResolver(frontmatter);

        // 4. Resolve all core variables
        const level = resolveValue(blockData.level) ?? frontmatter['DnD_level'] ?? frontmatter['level'] ?? 1;
        const rawProficiencyBonus = resolveValue(blockData.proficiencyBonus ?? blockData['proficiency_bonus'])
            ?? frontmatter['DnD_proficiencyBonus']
            ?? frontmatter['proficiency_bonus'];
        const rawClass = resolveValue(blockData.class) ?? frontmatter['DnD_class'];
        const rawSubclass = resolveValue(blockData.subclass) ?? frontmatter['DnD_subclass'] ?? frontmatter['DnD_Subclass'];
        const classLevels = resolveValue(blockData['classLevels']) ?? frontmatter['DnD_classLevels'];
        const rawRace = resolveValue(blockData.race) ?? frontmatter['DnD_race'];
        const rawRaceLineage = resolveValue(blockData['raceLineage']) ?? frontmatter['DnD_raceLineage'];
        const rawBackground = resolveValue(blockData.background) ?? frontmatter['DnD_background'];
        const extraFeats = resolveValue(blockData['extraFeats']) ?? frontmatter['DnD_extraFeats'];

        const dndClass = hasValidValue(rawClass) ? rawClass : null;
        const subclass = hasValidValue(rawSubclass) ? rawSubclass : null;
        // Races, like classes, arrive as Obsidian lists (["Orc"]). Unwrap to the first valid
        // string so custom races (not in the bundled racesMap) resolve correctly in data.ts.
        const race = hasValidValue(rawRace)
            ? (Array.isArray(rawRace) ? String(rawRace.find(hasValidValue)).trim() : String(rawRace).trim())
            : null;
        const raceLineage = hasValidValue(rawRaceLineage)
            ? (Array.isArray(rawRaceLineage) ? String(rawRaceLineage.find(hasValidValue)).trim() : String(rawRaceLineage).trim())
            : null;
        const background = hasValidValue(rawBackground) ? rawBackground : null;

        const classChoicesRaw = resolveValue(blockData['classChoices']) ?? frontmatter['DnD_classChoices'];
        const classChoicesFlat = flattenClassChoices(classChoicesRaw);
        const hideRaw = resolveValue(blockData.hide) ?? frontmatter['DnD_hideFeature'];
        const edition = resolveValue(blockData.edition);

        const fetchOptions = {
            ...plugin.settings,
            edition: edition ? String(edition) : undefined
        };

        // Normalize the 'hide' variable into a clean array of lowercased strings
        const hiddenFeatures = parseStringArray(hideRaw).map(name => name.toLowerCase());

        // 5. Validate Multiclassing Levels & Ensure Numbers
        const parsedLevel = Number(level) || 0;
        const parsedProficiencyBonus = (hasValidValue(rawProficiencyBonus) && !isNaN(Number(rawProficiencyBonus)))
            ? Number(rawProficiencyBonus)
            : Math.ceil(1 + ((parsedLevel || 1) / 4));

        // 5.5. Parse featureUses array ([ ["<Feature/Feat-Name>", "UsesAvailable", "UsesUsed"], ... ])
        const rawFeatureUsesProp = blockData.featureUses ?? blockData['feature-uses'];
        const targetFeatureUsesFmKey = extractFrontmatterKey(rawFeatureUsesProp, "DnD_featureUses");
        const featureUsesRaw = parseJsonArrayProp(resolveValue(rawFeatureUsesProp) ?? frontmatter[targetFeatureUsesFmKey]);

        const featureUsesState: { name: string; max: number; used: number }[] = [];
        for (const item of featureUsesRaw) {
            const tuple = resolveValue(item);
            if (Array.isArray(tuple) && tuple.length >= 3 && tuple[0]) {
                const fName = String(tuple[0]).trim();
                const fMax = Math.max(0, Number(String(tuple[1]).replace(/[^0-9.-]/g, "")) || 0);
                const fUsed = Math.max(0, Number(String(tuple[2]).replace(/[^0-9.-]/g, "")) || 0);
                if (fName) {
                    featureUsesState.push({
                        name: fName,
                        max: fMax,
                        used: fMax > 0 ? Math.min(fMax, fUsed) : fUsed
                    });
                }
            }
        }

        let featureUsesNeedsSync = false;
        const performSelfSyncUpdate = async (updates: Record<string, string>) => {
            if (isUnloaded || myRenderId !== activeRenderId) return;
            clearPendingSelfSync();
            const latestFm = plugin.app.metadataCache.getCache(ctx.sourcePath)?.frontmatter || frontmatter;
            const excludeKeys = Object.keys(updates);
            pendingSelfSync = {
                updates,
                excludeKeys,
                nonSyncSignature: getNonSyncSignature(latestFm, excludeKeys)
            };
            pendingSelfSyncTimer = setTimeout(() => {
                pendingSelfSync = null;
                pendingSelfSyncTimer = null;
            }, 1500);

            try {
                await plugin.updateCharacterFrontmatter(ctx.sourcePath, updates);
            } catch (err) {
                clearPendingSelfSync();
                throw err;
            }
        };

        const saveFeatureUsesToFrontmatter = async () => {
            const serialized: [string, string, string][] = featureUsesState.map(entry => [
                String(entry.name),
                String(entry.max),
                String(entry.used)
            ]);
            await performSelfSyncUpdate({
                [targetFeatureUsesFmKey]: JSON.stringify(serialized)
            });
        };

        // Helper: Evaluate a feature's "uses" formula (supports blockData vars, frontmatter vars, and +, -, *, /)
        const evaluateFeatureUses = (rawUses: any, contextClassLevel?: number, contextClassIndex?: number): number => {
            if (Array.isArray(rawUses)) {
                rawUses = rawUses[0];
            }
            if (rawUses === undefined || rawUses === null || rawUses === "") return 0;
            if (typeof rawUses === "number") return Math.max(0, Math.floor(rawUses));

            const exprStr = String(rawUses).trim();
            if (!exprStr) return 0;

            const resolveVariable = (ident: string): number => {
                const cleanIdent = ident.trim();
                if (cleanIdent === "proficiencyBonus" || cleanIdent === "proficiency_bonus" || cleanIdent === "DnD_proficiencyBonus") {
                    return parsedProficiencyBonus;
                }
                if (cleanIdent === "level" || cleanIdent === "DnD_level" || cleanIdent === "classLevels" || cleanIdent === "classLevel" || cleanIdent === "DnD_classLevels") {
                    if (contextClassLevel !== undefined) return Number(contextClassLevel) || 0;
                    if (Array.isArray(classLevels) && contextClassIndex !== undefined && classLevels.length > contextClassIndex) {
                        return Number(classLevels[contextClassIndex]) || 0;
                    }
                    return parsedLevel;
                }

                const modMatch = cleanIdent.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)(?:_?modifier|_?mod)$/i);
                if (modMatch) {
                    const statAbbrMap: Record<string, string> = {
                        str: "strength", dex: "dexterity", con: "constitution",
                        int: "intelligence", wis: "wisdom", cha: "charisma"
                    };
                    const baseStat = statAbbrMap[modMatch[1].toLowerCase()] || modMatch[1].toLowerCase();
                    const rawStat = (blockData && (blockData[baseStat] ?? blockData[`DnD_${baseStat}`]) !== undefined)
                        ? resolveValue(blockData[baseStat] ?? blockData[`DnD_${baseStat}`])
                        : (frontmatter[`DnD_${baseStat}`] ?? frontmatter[baseStat]);
                    const score = Number(rawStat) || 10;
                    return Math.max(1, Math.floor((score - 10) / 2));
                }

                // 1. Check dnd-features code block variables first
                if (blockData && blockData[cleanIdent] !== undefined) {
                    const resolved = resolveValue(blockData[cleanIdent]);
                    if (Array.isArray(resolved)) {
                        const picked = (contextClassIndex !== undefined && resolved.length > contextClassIndex)
                            ? resolved[contextClassIndex]
                            : resolved[0];
                        return Number(picked) || 0;
                    }
                    return Number(resolved) || 0;
                }

                // 2. Fallback to frontmatter variables (exact name or prefixed with DnD_)
                const fmCandidate = frontmatter[cleanIdent] !== undefined
                    ? frontmatter[cleanIdent]
                    : frontmatter[`DnD_${cleanIdent}`];
                if (fmCandidate !== undefined) {
                    if (Array.isArray(fmCandidate)) {
                        const picked = (contextClassIndex !== undefined && fmCandidate.length > contextClassIndex)
                            ? fmCandidate[contextClassIndex]
                            : fmCandidate[0];
                        return Number(picked) || 0;
                    }
                    return Number(fmCandidate) || 0;
                }

                return 0;
            };

            // Substitute all variable identifiers (supporting optional "frontmatter." prefix) with numeric values
            const numericExpr = exprStr.replace(/(?:frontmatter\.)?[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
                const varName = match.startsWith("frontmatter.") ? match.slice("frontmatter.".length) : match;
                return String(resolveVariable(varName));
            });

            // Tokenize numbers, +, -, *, /, (, )
            const tokens = numericExpr.match(/(\d+(?:\.\d+)?|\.\d+|[+\-*/()])/g);
            if (!tokens || tokens.length === 0) return 0;

            let pos = 0;
            const parseExpr = (): number => {
                let val = parseTerm();
                while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
                    const op = tokens[pos++];
                    const right = parseTerm();
                    val = op === "+" ? val + right : val - right;
                }
                return val;
            };
            const parseTerm = (): number => {
                let val = parseFactor();
                while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
                    const op = tokens[pos++];
                    const right = parseFactor();
                    val = op === "*" ? val * right : (right !== 0 ? val / right : 0);
                }
                return val;
            };
            const parseFactor = (): number => {
                if (pos >= tokens.length) return 0;
                const tok = tokens[pos];
                if (tok === "+") {
                    pos++;
                    return parseFactor();
                }
                if (tok === "-") {
                    pos++;
                    return -parseFactor();
                }
                if (tok === "(") {
                    pos++;
                    const val = parseExpr();
                    if (pos < tokens.length && tokens[pos] === ")") pos++;
                    return val;
                }
                pos++;
                const num = Number(tok);
                return isNaN(num) ? 0 : num;
            };

            const result = parseExpr();
            if (!isFinite(result) || isNaN(result)) return 0;
            return Math.max(1, Math.floor(result));
        };

        // Helper: Render interactive Uses pips on the top-right of a feature/feat title bar
        const renderFeatureUses = (
            titleContainer: HTMLElement,
            featureObj: any,
            contextClassLevel?: number,
            contextClassIndex?: number
        ) => {
            if (!featureObj || featureObj.uses === undefined || featureObj.uses === null || featureObj.uses === "") return;
            const usesFormula = Array.isArray(featureObj.uses) ? featureObj.uses[0] : featureObj.uses;
            const restType: "short" | "long" = (Array.isArray(featureObj.uses) && String(featureObj.uses[1] || "").toLowerCase().trim() === "short")
                ? "short"
                : "long";
            const maxUses = evaluateFeatureUses(usesFormula, contextClassLevel, contextClassIndex);
            if (maxUses <= 0 || !featureObj.name) return;

            const cleanFeatureName = String(featureObj.name).trim();
            plugin.featureRestTypes.set(cleanFeatureName.toLowerCase(), restType);
            let stateEntry = featureUsesState.find(
                e => e.name.toLowerCase() === cleanFeatureName.toLowerCase()
            );
            if (!stateEntry) {
                stateEntry = { name: cleanFeatureName, max: maxUses, used: 0 };
                featureUsesState.push(stateEntry);
                featureUsesNeedsSync = true;
            } else {
                const clampedUsed = Math.min(maxUses, Math.max(0, stateEntry.used));
                if (stateEntry.max !== maxUses || stateEntry.used !== clampedUsed) {
                    stateEntry.max = maxUses;
                    stateEntry.used = clampedUsed;
                    featureUsesNeedsSync = true;
                }
            }

            const usesTracker = titleContainer.createDiv({ cls: "dnd-feature-uses-tracker" });
            usesTracker.createEl("span", {
                text: "Uses:",
                cls: "dnd-spell-slots-label"
            });

            const pipsContainer = usesTracker.createDiv({ cls: "dnd-spell-slots-pips" });
            const pipStates: boolean[] = Array.from({ length: maxUses }, (_, idx) => idx < stateEntry!.used);

            const applyPipVisual = (pipEl: HTMLElement, active: boolean) => {
                pipEl.classList.toggle("is-used", active);
                pipEl.setAttribute("title", active ? "Tap to restore use" : "Tap to expend use");
            };

            for (let uIdx = 0; uIdx < maxUses; uIdx++) {
                const pip = pipsContainer.createDiv({
                    cls: `dnd-slot-pip ${pipStates[uIdx] ? "is-used" : ""}`
                });
                applyPipVisual(pip, pipStates[uIdx]);

                pip.addEventListener("pointerdown", async (e: PointerEvent) => {
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    e.preventDefault();
                    e.stopPropagation();

                    pipStates[uIdx] = !pipStates[uIdx];
                    applyPipVisual(pip, pipStates[uIdx]);

                    const newUsedCount = pipStates.filter(Boolean).length;
                    stateEntry!.used = newUsedCount;

                    await saveFeatureUsesToFrontmatter();
                });
            }
        };

        if (Array.isArray(dndClass) && dndClass.length > 1) {
            if (!Array.isArray(classLevels) || classLevels.length !== dndClass.length) {
                const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                errorBox.createEl("strong", { text: "DnD Features Plugin Error:" });
                errorBox.createEl("p", {
                    text: `You have multiple classes listed, but the "class-levels" variable is missing or is invalid. Please provide a level for each class.`
                });
                commitWrapper();
                return;
            }

            const totalClassLevels = classLevels.reduce((sum, current) => sum + Number(current), 0);
            if (totalClassLevels !== parsedLevel) {
                const errorBox = wrapper.createDiv({ cls: "dnd-error-window" });
                errorBox.createEl("strong", { text: "DnD Features Plugin Error:" });
                errorBox.createEl("p", {
                    text: `The sum of class-levels (${totalClassLevels}) does not match the total level (${parsedLevel}).`
                });
                commitWrapper();
                return;
            }
        }

        // 6. Setup the Registry Lookup
        const classArray = dndClass ? (Array.isArray(dndClass) ? dndClass.filter(hasValidValue) : [dndClass]) : [];
        const rawSubclassArray = subclass ? (Array.isArray(subclass) ? subclass.filter(hasValidValue) : [subclass]) : [];
        const subclassArray = classArray.map((_, i) => rawSubclassArray[i] || null);

        // 7. PRE-PASS: Gather all auto-granted feats and determine dynamic subclass level
        let finalExtraFeats = parseExtraFeatsList(extraFeats);
        let hasActiveSubclass = false;

        const autoGrantedRouterCache = new Map<string, boolean>();
        if (classArray.length > 0) {
            for (let index = 0; index < classArray.length; index++) {
                const className = classArray[index];
                const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                    ? Number(classLevels[index])
                    : Number(level);

                const classData = await getClassData(plugin.app, fetchOptions, className);

                if (classData && classData.features) {
                    const grantedSubclassFile = plugin.findGrantedSubclass(classData, currentClassLevel);
                    let subclassData: any = null;

                    if (grantedSubclassFile && subclassArray[index]) {
                        subclassData = await getSubclassData(plugin.app, fetchOptions, grantedSubclassFile, subclassArray[index]);
                        if (subclassData) {
                            const levelKeys = Object.keys(subclassData).map(Number).filter(n => !isNaN(n));
                            const subclassStartLevel = levelKeys.length > 0 ? Math.min(...levelKeys) : 1;
                            if (currentClassLevel >= subclassStartLevel) {
                                hasActiveSubclass = true;
                            }
                        }
                    }

                    for (let i = 1; i <= currentClassLevel; i++) {
                        const levelFeatures = classData.features[i.toString()];
                        if (levelFeatures) {
                            for (const feature of levelFeatures) {
                                const autoFeat = await plugin.extractSingleAutoGrantedFeat(feature.grantedFeats, fetchOptions, autoGrantedRouterCache);
                                if (autoFeat) finalExtraFeats.push(autoFeat);
                            }
                        }

                        if (subclassData) {
                            const subLevelFeatures = subclassData[i.toString()];
                            if (subLevelFeatures) {
                                for (const feature of subLevelFeatures) {
                                    const autoFeat = await plugin.extractSingleAutoGrantedFeat(feature.grantedFeats, fetchOptions, autoGrantedRouterCache);
                                    if (autoFeat) finalExtraFeats.push(autoFeat);
                                }
                            }
                        }
                    }
                }
            }
        }

        if (race) {
            const raceAutoFeats = await plugin.collectRaceAutoGrantedFeats(race, raceLineage, fetchOptions, autoGrantedRouterCache);
            finalExtraFeats.push(...raceAutoFeats);
        }

        // Clean up the gathered feats to remove engine mechanics and router files
        const validFeats: string[] = [];
        const seenFeatSlugs = new Set<string>();
        for (const featId of finalExtraFeats) {
            const cleanFeatId = String(featId ?? "").trim();
            const featSlug = normalizeFeatKey(cleanFeatId);
            if (!hasValidValue(cleanFeatId) || featSlug === "ability-score-improvement" || seenFeatSlugs.has(featSlug)) continue;

            const routerData = await getFeatMapData(plugin.app, fetchOptions, cleanFeatId);
            const isRouter = !!routerData;

            if (!isRouter) {
                seenFeatSlugs.add(featSlug);
                validFeats.push(cleanFeatId);
            }
        }

        finalExtraFeats = validFeats;

        // Loop through the user's custom section order
        for (const sectionName of plugin.settings.sectionOrder) {
            if (sectionName === "Class" && classArray.length === 0) continue;
            if (sectionName === "Subclass" && (!subclass || plugin.settings.combineClassSubclass || !hasActiveSubclass)) continue;
            if (sectionName === "Race" && !race) continue;
            if (sectionName === "Background" && !background) continue;
            if (sectionName === "Extra Feats" && finalExtraFeats.length === 0) continue;

            let sectionTitle = `${sectionName} Features:`;
            if (sectionName === "Class" && plugin.settings.combineClassSubclass && hasActiveSubclass) sectionTitle = "Class & Subclass Features:";
            if (sectionName === "Race") sectionTitle = "Race Traits:";
            if (sectionName === "Background") sectionTitle = "Background Feat:";
            if (sectionName === "Extra Feats") sectionTitle = "Extra Feats:";

            // Build in a detached container first so we only append the section if it actually has content!
            const sectionWindow = document.createElement('div');
            sectionWindow.className = "dnd-features-window";
            const sectionDiv = sectionWindow.createDiv({ cls: `dnd-section-${sectionName.toLowerCase()}` });

            // Render Class Section
            if (sectionName === "Class") {
                for (let index = 0; index < classArray.length; index++) {
                    const className = classArray[index];
                    const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                        ? Number(classLevels[index])
                        : Number(level);

                    const classData = await getClassData(plugin.app, fetchOptions, className);
                    if (!classData || !classData.features) continue;

                    if (classArray.length > 1) {
                        sectionDiv.createEl("h4", { text: `${className} Features (Level ${currentClassLevel})`, cls: "dnd-class-header" });
                    }

                    for (let i = 1; i <= currentClassLevel; i++) {
                        const levelFeatures = classData.features[i.toString()];

                        if (levelFeatures && levelFeatures.length > 0) {
                            for (const feature of levelFeatures) {
                                if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                await plugin.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                            }
                        }

                        for (const choiceEntry of classChoicesFlat) {
                            const choiceKey = choiceEntry.key;
                            const choiceLevel = choiceEntry.level;

                            if (Number(choiceLevel) === i && choiceKey) {
                                const featureData = await getClassChoiceData(plugin.app, fetchOptions, choiceKey);
                                if (featureData && featureData.name) {
                                    if (featureData.hide === true || (featureData.name && hiddenFeatures.includes(featureData.name.toLowerCase()))) continue;

                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    const badgeText = featureData.badge || "Choice";
                                    titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge dnd-badge-combined" });
                                    titleContainer.createEl("span", { text: featureData.name, cls: "dnd-feature-name" });
                                    renderFeatureUses(titleContainer, featureData, currentClassLevel, index);

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await plugin.renderDndMarkdown(featureData.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }
                        }

                        const grantedSubclassFile = plugin.findGrantedSubclass(classData, currentClassLevel);
                        if (plugin.settings.combineClassSubclass && subclassArray[index] && grantedSubclassFile) {
                            const subclassName = subclassArray[index];
                            const subclassData = await getSubclassData(plugin.app, fetchOptions, grantedSubclassFile, subclassName);
                            const subLevelFeatures = subclassData ? subclassData[i.toString()] : null;

                            if (subLevelFeatures && subLevelFeatures.length > 0) {
                                for (const feature of subLevelFeatures) {
                                    if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge dnd-badge-combined" });
                                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                    renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await plugin.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }
                        }
                    }
                }
            }

            // Render Subclass Section
            else if (sectionName === "Subclass") {
                for (let index = 0; index < classArray.length; index++) {
                    const className = classArray[index];
                    const currentClassLevel = (classArray.length > 1 && Array.isArray(classLevels) && classLevels.length > index)
                        ? Number(classLevels[index])
                        : Number(level);
                    const subclassName = subclassArray[index];

                    const classData = await getClassData(plugin.app, fetchOptions, className);
                    const grantedSubclassFile = plugin.findGrantedSubclass(classData, currentClassLevel);

                    if (subclassName && classData && grantedSubclassFile) {
                        const subclassData = await getSubclassData(plugin.app, fetchOptions, grantedSubclassFile, subclassName);
                        if (!subclassData) continue;

                        if (classArray.length > 1) {
                            sectionDiv.createEl("h4", { text: `${subclassName} Features`, cls: "dnd-class-header" });
                        }

                        for (let i = 1; i <= currentClassLevel; i++) {
                            const subLevelFeatures = subclassData[i.toString()];
                            if (subLevelFeatures && subLevelFeatures.length > 0) {
                                for (const feature of subLevelFeatures) {
                                    if (feature.hide === true || (feature.name && hiddenFeatures.includes(feature.name.toLowerCase()))) continue;

                                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                                    titleContainer.createEl("span", { text: feature.badge ? feature.badge : `Lvl ${i}`, cls: "dnd-level-badge" });
                                    titleContainer.createEl("span", { text: feature.name, cls: "dnd-feature-name" });
                                    renderFeatureUses(titleContainer, feature, currentClassLevel, index);

                                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                                    await plugin.renderDndMarkdown(feature.description, descDiv, ctx.sourcePath, renderChild);
                                }
                            }
                        }
                    }
                }
            }

            // Render Race Section
            else if (sectionName === "Race") {
                const raceData = await getRaceData(plugin.app, fetchOptions, race);

                if (raceData && raceData.traits) {
                    for (const trait of raceData.traits) {
                        if (trait.hide === true || (trait.name && hiddenFeatures.includes(trait.name.toLowerCase()))) continue;

                        if (trait.lineage) {
                            if (!raceLineage || trait.lineage.toLowerCase() !== String(raceLineage).toLowerCase()) {
                                continue;
                            }
                        }

                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        const defaultBadge = trait.lineage ? "Lineage" : "Trait";
                        const badgeClass = trait.lineage ? "dnd-level-badge dnd-badge-combined" : "dnd-level-badge";

                        titleContainer.createEl("span", { text: trait.badge ? trait.badge : defaultBadge, cls: badgeClass });
                        titleContainer.createEl("span", { text: trait.name, cls: "dnd-feature-name" });
                        renderFeatureUses(titleContainer, trait);

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await plugin.renderDndMarkdown(trait.description, descDiv, ctx.sourcePath, renderChild);
                    }
                }
            }

            // Render Background Section
            else if (sectionName === "Background") {
                const bgData = await getBackgroundData(plugin.app, fetchOptions, background);
                const featData = bgData && bgData.feat ? await getExtraFeat(plugin.app, fetchOptions, bgData.feat) : null;

                if (featData && featData.hide !== true && (!featData.name || !hiddenFeatures.includes(featData.name.toLowerCase()))) {
                    const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                    const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                    titleContainer.createEl("span", { text: "Origin Feat", cls: "dnd-level-badge" });
                    titleContainer.createEl("span", { text: featData.name, cls: "dnd-feature-name" });
                    renderFeatureUses(titleContainer, featData);

                    const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                    await plugin.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                }
            }

            // Render Extra Feats Section
            else if (sectionName === "Extra Feats") {
                for (const featId of finalExtraFeats) {
                    const safeFeatId = typeof featId === 'string' ? featId : String(featId);
                    const featData = await getExtraFeat(plugin.app, fetchOptions, safeFeatId);

                    if (featData) {
                        if (featData.hide === true || (featData.name && hiddenFeatures.includes(featData.name.toLowerCase()))) continue;

                        const featureBlock = sectionDiv.createDiv({ cls: "dnd-feature-block" });
                        const titleContainer = featureBlock.createDiv({ cls: "dnd-feature-title" });

                        const badgeText = featData.badge ? featData.badge : (featData.category ? featData.category : "Feat");
                        titleContainer.createEl("span", { text: badgeText, cls: "dnd-level-badge" });
                        titleContainer.createEl("span", { text: featData.name || formatFeatureOrSlug(safeFeatId), cls: "dnd-feature-name" });
                        renderFeatureUses(titleContainer, featData);

                        const descDiv = featureBlock.createDiv({ cls: "dnd-feature-desc" });
                        await plugin.renderDndMarkdown(featData.description, descDiv, ctx.sourcePath, renderChild);
                    }
                }
            }

            // ONLY append the header and window if at least one feature block was actually rendered!
            if (sectionDiv.querySelector(".dnd-feature-block")) {
                wrapper.createEl("h3", { text: sectionTitle, cls: "dnd-section-header" });
                wrapper.appendChild(sectionWindow);
            }
        }
        if (!commitWrapper()) return;

        // Auto-sync DnD_weaponMastery[0] (available slots) in frontmatter from class/subclass/feat JSONs
        const rawWeaponMasteryProp = blockData.weaponMastery ?? blockData['weapon-mastery'];
        const targetWeaponMasteryFmKey = extractFrontmatterKey(rawWeaponMasteryProp, "DnD_weaponMastery");

        const rawWmValue = resolveValue(rawWeaponMasteryProp) ?? frontmatter[targetWeaponMasteryFmKey];
        const currentMasteryState = parseWeaponMasteryState(rawWmValue);
        const bgFeatForMastery = await plugin.resolveBackgroundFeatId(background, frontmatter["DnD_backgroundFeat"], fetchOptions);
        if (isUnloaded || myRenderId !== activeRenderId) return;
        const masteryCalc = await plugin.resolveCharacterWeaponMasterySlots(
            dndClass,
            classLevels,
            parsedLevel,
            finalExtraFeats,
            bgFeatForMastery,
            subclass,
            fetchOptions,
            race,
            raceLineage
        );
        if (isUnloaded || myRenderId !== activeRenderId) return;

        const expectedSerializedMastery = serializeWeaponMasteryState(masteryCalc.totalSlots, currentMasteryState.mastered);
        const weaponMasteryNeedsSync = (
            currentMasteryState.available !== masteryCalc.totalSlots ||
            (rawWmValue !== undefined && String(rawWmValue).trim() !== expectedSerializedMastery && rawWeaponMasteryProp !== undefined)
        );

        if (featureUsesNeedsSync || weaponMasteryNeedsSync) {
            const fmUpdates: Record<string, string> = {};
            if (featureUsesNeedsSync) {
                const serializedUses: [string, string, string][] = featureUsesState.map(entry => [
                    String(entry.name),
                    String(entry.max),
                    String(entry.used)
                ]);
                fmUpdates[targetFeatureUsesFmKey] = JSON.stringify(serializedUses);
            }
            if (weaponMasteryNeedsSync) {
                fmUpdates[targetWeaponMasteryFmKey] = expectedSerializedMastery;
            }
            await performSelfSyncUpdate(fmUpdates);
        }
    };

    // 3. Initial Render
    renderContent();

    // 4. Register Event Listener for Frontmatter Changes
    renderChild.registerEvent(
        plugin.app.metadataCache.on('changed', (file, _data, cache) => {
            if (isUnloaded || file.path !== ctx.sourcePath) return;

            if (plugin.rulebookRevision !== lastRenderedRevision) {
                clearPendingSelfSync();
                renderContent(cache);
                return;
            }

            if (pendingSelfSync) {
                const incomingFm = cache?.frontmatter;
                const nonSyncMatches = getNonSyncSignature(incomingFm, pendingSelfSync.excludeKeys) === pendingSelfSync.nonSyncSignature;
                const syncedKeysMatch = Object.entries(pendingSelfSync.updates).every(
                    ([key, val]) => String(incomingFm?.[key] ?? '') === val
                );
                clearPendingSelfSync();
                if (nonSyncMatches && syncedKeysMatch) {
                    return;
                }
            }

            renderContent(cache);
        })
    );
}
