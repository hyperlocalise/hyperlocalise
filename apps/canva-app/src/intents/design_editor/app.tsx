import {
    Alert,
    Box,
    Button,
    Checkbox,
    CheckboxGroup,
    FormField,
    Rows,
    Select,
    Text,
    TextInput,
    Title,
} from "@canva/app-ui-kit";
import { getDesignToken } from "@canva/design";
import { requestOpenExternalUrl } from "@canva/platform";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import * as styles from "styles/components.css";
import {
    extractDesignContent,
    listDesignPages,
} from "./design-content";
import {
    fetchCanvaMe,
    fetchCanvaProjects,
    pollLocalizeDesign,
    startLocalizeDesign,
} from "./hyperlocalise-client";
import {
    connectHyperlocalise,
    disconnectHyperlocalise,
    getHyperlocaliseAccessToken,
} from "./oauth";
import {
    loadSettings,
    parseSelectedPageValues,
    parseTargetLocales,
    saveSettings,
    selectedPageValues,
} from "./settings";
import type {
    CanvaOrganizationSummary,
    CanvaProjectSummary,
    DesignPageInfo,
} from "./types";

function pageDescription(page: DesignPageInfo): string {
    if (!page.editable) {
        return page.locked ? "Locked page" : "Unsupported page type";
    }

    return "Editable page";
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export const App = () => {
    const intl = useIntl();
    const [settings, setSettings] = useState(() => loadSettings());
    const [isSignedIn, setIsSignedIn] = useState(false);
    const [organizations, setOrganizations] = useState<CanvaOrganizationSummary[]>([]);
    const [userEmail, setUserEmail] = useState("");
    const [projects, setProjects] = useState<CanvaProjectSummary[]>([]);
    const [pages, setPages] = useState<DesignPageInfo[]>([]);
    const [selectedPageIndices, setSelectedPageIndices] = useState<number[]>(
        settings.selectedPageIndices,
    );
    const [selectedOrganizationId, setSelectedOrganizationId] = useState(
        settings.organizationId,
    );
    const [selectedProjectId, setSelectedProjectId] = useState(settings.projectId);
    const [rememberBrandOrgBinding, setRememberBrandOrgBinding] = useState(
        settings.rememberBrandOrgBinding,
    );
    const targetLocales = useMemo(
        () => parseTargetLocales(settings.targetLocales),
        [settings.targetLocales],
    );
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoadingContext, setIsLoadingContext] = useState(true);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isLocalizing, setIsLocalizing] = useState(false);
    const [jobStatus, setJobStatus] = useState<string | null>(null);

    const pageOptions = useMemo(
        () =>
            pages.map((page) => ({
                value: String(page.index),
                label: page.label,
                description: pageDescription(page),
                disabled: !page.editable,
            })),
        [pages],
    );

    const persistSettings = useCallback((next: Partial<typeof settings>) => {
        const merged = { ...settings, ...next };
        saveSettings(merged);
        setSettings(merged);
        return merged;
    }, [settings]);

    const loadFrictionlessContext = useCallback(async () => {
        setIsLoadingContext(true);
        setErrorMessage(null);

        try {
            const designPages = await listDesignPages();
            setPages(designPages);

            if (selectedPageIndices.length === 0) {
                const editableIndices = designPages
                    .filter((page) => page.editable)
                    .map((page) => page.index);
                setSelectedPageIndices(editableIndices);
                persistSettings({ selectedPageIndices: editableIndices });
            }
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsLoadingContext(false);
        }
    }, [persistSettings, selectedPageIndices.length]);

    const loadProjectsForOrganization = useCallback(async (organizationId: string) => {
        if (!organizationId) {
            setProjects([]);
            return;
        }

        setIsLoadingProjects(true);
        setErrorMessage(null);

        try {
            const projectList = await fetchCanvaProjects(organizationId);
            setProjects(projectList);

            const preferredProjectId =
                settings.projectId ||
                (projectList.length === 1 ? projectList[0]?.id : "") ||
                "";
            if (preferredProjectId) {
                setSelectedProjectId(preferredProjectId);
            }
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsLoadingProjects(false);
        }
    }, [settings.projectId]);

    const loadAccountContext = useCallback(async () => {
        const accessToken = await getHyperlocaliseAccessToken();
        if (!accessToken) {
            setIsSignedIn(false);
            setOrganizations([]);
            setUserEmail("");
            setProjects([]);
            return;
        }

        setIsSignedIn(true);

        try {
            const account = await fetchCanvaMe();
            setOrganizations(account.organizations);
            setUserEmail(account.user.email);

            const preferredOrganizationId =
                settings.organizationId ||
                account.brandBinding?.organizationId ||
                (account.organizations.length === 1
                    ? account.organizations[0]?.id
                    : "") ||
                "";

            if (preferredOrganizationId) {
                setSelectedOrganizationId(preferredOrganizationId);
                persistSettings({ organizationId: preferredOrganizationId });
                await loadProjectsForOrganization(preferredOrganizationId);
            }
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        }
    }, [loadProjectsForOrganization, persistSettings, settings.organizationId]);

    useEffect(() => {
        void loadFrictionlessContext();
        void loadAccountContext();
    }, [loadAccountContext, loadFrictionlessContext]);

    const handleSignIn = async () => {
        setIsConnecting(true);
        setErrorMessage(null);

        try {
            const result = await connectHyperlocalise();
            if (result !== "completed") {
                throw new Error("Hyperlocalise sign-in was not completed.");
            }
            await loadAccountContext();
            setStatusMessage(
                intl.formatMessage({
                    id: "hyperlocalise.canva.status.signedIn",
                    defaultMessage: "Signed in to Hyperlocalise.",
                    description:
                        "Status shown after the user connects Hyperlocalise.",
                }),
            );
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsConnecting(false);
        }
    };

    const handleSignOut = async () => {
        await disconnectHyperlocalise();
        setIsSignedIn(false);
        setOrganizations([]);
        setUserEmail("");
        setProjects([]);
        setSelectedOrganizationId("");
        setSelectedProjectId("");
        setStatusMessage(
            intl.formatMessage({
                id: "hyperlocalise.canva.status.signedOut",
                defaultMessage: "Signed out of Hyperlocalise.",
                description:
                    "Status shown after the user disconnects Hyperlocalise.",
            }),
        );
    };

    const handleOrganizationChange = async (organizationId: string) => {
        setSelectedOrganizationId(organizationId);
        setSelectedProjectId("");
        persistSettings({ organizationId, projectId: "" });
        await loadProjectsForOrganization(organizationId);
    };

    const handleLocalize = async () => {
        if (!selectedOrganizationId || !selectedProjectId) {
            setErrorMessage(
                intl.formatMessage({
                    id: "hyperlocalise.canva.error.missingOrgProject",
                    defaultMessage:
                        "Choose an organization and project before localizing.",
                    description:
                        "Validation error when org or project is missing.",
                }),
            );
            return;
        }

        if (targetLocales.length === 0) {
            setErrorMessage(
                intl.formatMessage({
                    id: "hyperlocalise.canva.error.missingLocales",
                    defaultMessage: "Select at least one target locale.",
                    description:
                        "Validation error when no target locales are selected.",
                }),
            );
            return;
        }

        if (selectedPageIndices.length === 0) {
            setErrorMessage(
                intl.formatMessage({
                    id: "hyperlocalise.canva.error.missingPages",
                    defaultMessage: "Select at least one page to localize.",
                    description:
                        "Validation error when no pages are selected.",
                }),
            );
            return;
        }

        setIsLocalizing(true);
        setErrorMessage(null);
        setJobStatus(null);

        try {
            const accessToken = await getHyperlocaliseAccessToken();
            if (!accessToken) {
                throw new Error("Sign in to Hyperlocalise before localizing.");
            }

            const [designToken, extracted] = await Promise.all([
                getDesignToken(),
                extractDesignContent(
                    selectedPageIndices,
                    settings.preserveFormatting,
                ),
            ]);

            persistSettings({
                organizationId: selectedOrganizationId,
                projectId: selectedProjectId,
                targetLocales: settings.targetLocales,
                selectedPageIndices,
                rememberBrandOrgBinding,
            });

            const created = await startLocalizeDesign({
                organizationId: selectedOrganizationId,
                projectId: selectedProjectId,
                sourceLocale: settings.sourceLocale,
                targetLocales,
                designToken: designToken.token,
                segments: extracted.segments,
                rememberBrandOrgBinding,
            });

            setJobStatus("queued");
            setStatusMessage(
                intl.formatMessage(
                    {
                        id: "hyperlocalise.canva.status.jobStarted",
                        defaultMessage: "Localization job {jobId} started.",
                        description:
                            "Status shown after a localization job is created.",
                    },
                    { jobId: created.jobId },
                ),
            );

            const finalStatus = await pollLocalizeDesign({
                organizationId: selectedOrganizationId,
                projectId: selectedProjectId,
                jobId: created.jobId,
            });

            setJobStatus("succeeded");
            setStatusMessage(
                intl.formatMessage(
                    {
                        id: "hyperlocalise.canva.status.jobFinished",
                        defaultMessage:
                            "Localization job {jobId} finished with {segmentCount} segments translated.",
                        description:
                            "Status shown after localization completes.",
                    },
                    {
                        jobId: finalStatus.jobId,
                        segmentCount: Object.keys(
                            finalStatus.translationsByLocale[targetLocales[0] ?? ""] ?? {},
                        ).length,
                    },
                ),
            );
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setIsLocalizing(false);
        }
    };

    const organizationOptions = organizations.map((org) => ({
        value: org.id,
        label: org.name,
    }));

    const projectOptions = projects.map((project) => ({
        value: project.id,
        label: project.name,
    }));

    const canLocalize =
        isSignedIn &&
        Boolean(selectedOrganizationId) &&
        Boolean(selectedProjectId) &&
        targetLocales.length > 0 &&
        selectedPageIndices.length > 0;

    return (
        <div className={styles.scrollContainer}>
            <Rows spacing="2u">
                <Title>
                    <FormattedMessage
                        id="hyperlocalise.canva.title"
                        defaultMessage="Hyperlocalise"
                        description="App title in the Canva design editor panel."
                    />
                </Title>

                <Text>
                    <FormattedMessage
                        id="hyperlocalise.canva.intro"
                        defaultMessage="Browse pages without signing in. Sign in to Hyperlocalise when you are ready to localize."
                        description="Intro text explaining frictionless vs signed-in flows."
                    />
                </Text>

                {!isSignedIn ? (
                    <Button
                        variant="primary"
                        onClick={() => void handleSignIn()}
                        loading={isConnecting}
                        stretch
                    >
                        <FormattedMessage
                            id="hyperlocalise.canva.action.signIn"
                            defaultMessage="Sign in to Hyperlocalise"
                            description="Button to start OAuth sign-in."
                        />
                    </Button>
                ) : (
                    <Rows spacing="1u">
                        <Text>
                            <FormattedMessage
                                id="hyperlocalise.canva.status.signedInAs"
                                defaultMessage="Signed in as {email}"
                                description="Shows the signed-in Hyperlocalise user."
                                values={{ email: userEmail }}
                            />
                        </Text>
                        <Button
                            variant="secondary"
                            onClick={() => void handleSignOut()}
                            stretch
                        >
                            <FormattedMessage
                                id="hyperlocalise.canva.action.signOut"
                                defaultMessage="Sign out"
                                description="Button to disconnect Hyperlocalise."
                            />
                        </Button>
                    </Rows>
                )}

                {isSignedIn && organizationOptions.length > 0 && (
                    <FormField
                        label={intl.formatMessage({
                            id: "hyperlocalise.canva.field.organization",
                            defaultMessage: "Organization",
                            description: "Label for organization picker.",
                        })}
                        control={(props) => (
                            <Select
                                {...props}
                                value={selectedOrganizationId}
                                options={organizationOptions}
                                onChange={(value) =>
                                    void handleOrganizationChange(value)
                                }
                                placeholder={intl.formatMessage({
                                    id: "hyperlocalise.canva.field.organizationPlaceholder",
                                    defaultMessage: "Select organization",
                                    description:
                                        "Placeholder for organization picker.",
                                })}
                            />
                        )}
                    />
                )}

                {isSignedIn && selectedOrganizationId && (
                    <FormField
                        label={intl.formatMessage({
                            id: "hyperlocalise.canva.field.project",
                            defaultMessage: "Project",
                            description: "Label for project picker.",
                        })}
                        control={(props) => (
                            <Select
                                {...props}
                                value={selectedProjectId}
                                options={projectOptions}
                                onChange={(value) => {
                                    setSelectedProjectId(value);
                                    persistSettings({ projectId: value });
                                }}
                                disabled={isLoadingProjects}
                                placeholder={intl.formatMessage({
                                    id: "hyperlocalise.canva.field.projectPlaceholder",
                                    defaultMessage: "Select project",
                                    description:
                                        "Placeholder for project picker.",
                                })}
                            />
                        )}
                    />
                )}

                {isSignedIn && selectedOrganizationId && (
                    <Checkbox
                        checked={rememberBrandOrgBinding}
                        onChange={(_event, checked) => {
                            setRememberBrandOrgBinding(checked);
                            persistSettings({
                                rememberBrandOrgBinding: checked,
                            });
                        }}
                        label={intl.formatMessage({
                            id: "hyperlocalise.canva.field.rememberBrandOrg",
                            defaultMessage:
                                "Remember this organization for this Canva team",
                            description:
                                "Checkbox to save brand-to-org binding.",
                        })}
                    />
                )}

                <FormField
                    label={intl.formatMessage({
                        id: "hyperlocalise.canva.field.pages",
                        defaultMessage: "Pages to localize",
                        description: "Label for page multiselect.",
                    })}
                    value={selectedPageValues(selectedPageIndices)}
                    control={(props) => (
                        <CheckboxGroup
                            {...props}
                            options={pageOptions}
                            onChange={(values) => {
                                const indices = parseSelectedPageValues(values);
                                setSelectedPageIndices(indices);
                                persistSettings({
                                    selectedPageIndices: indices,
                                });
                            }}
                            disabled={isLoadingContext || pageOptions.length === 0}
                        />
                    )}
                />

                <FormField
                    label={intl.formatMessage({
                        id: "hyperlocalise.canva.field.targetLocales",
                        defaultMessage: "Target locales",
                        description: "Label for target locale input.",
                    })}
                    description="Comma-separated locale codes"
                    value={settings.targetLocales}
                    control={(props) => (
                        <TextInput
                            {...props}
                            placeholder="es, fr, de"
                            onChange={(value) =>
                                persistSettings({ targetLocales: value })
                            }
                        />
                    )}
                />

                <Box padding="2u" background="neutralLow">
                    <Text>
                        <FormattedMessage
                            id="hyperlocalise.canva.summary.editablePages"
                            defaultMessage="{count, plural, one {# editable page} other {# editable pages}}"
                            description="Shows how many editable pages are available."
                            values={{
                                count: pages.filter((page) => page.editable).length,
                            }}
                        />
                    </Text>
                </Box>

                <Button
                    variant="primary"
                    onClick={() => void handleLocalize()}
                    loading={isLocalizing}
                    disabled={!canLocalize}
                    stretch
                >
                    <FormattedMessage
                        id="hyperlocalise.canva.action.localize"
                        defaultMessage="Localize design"
                        description="Button to start localization."
                    />
                </Button>

                {!isSignedIn && (
                    <Alert tone="info">
                        <FormattedMessage
                            id="hyperlocalise.canva.info.signInRequired"
                            defaultMessage="Sign in to choose a workspace and start localization."
                            description="Info when user has not signed in yet."
                        />
                    </Alert>
                )}

                {statusMessage && (
                    <Alert tone="positive">{statusMessage}</Alert>
                )}
                {jobStatus && (
                    <Text>
                        <FormattedMessage
                            id="hyperlocalise.canva.status.latestJob"
                            defaultMessage="Latest job status: {status}"
                            description="Shows the latest localization job status."
                            values={{ status: jobStatus }}
                        />
                    </Text>
                )}
                {errorMessage && <Alert tone="critical">{errorMessage}</Alert>}

                <Button
                    variant="secondary"
                    onClick={() =>
                        void requestOpenExternalUrl({
                            url: "https://hyperlocalise.com/docs/integrations/canva",
                        })
                    }
                    stretch
                >
                    <FormattedMessage
                        id="hyperlocalise.canva.action.openSetupGuide"
                        defaultMessage="Open setup guide"
                        description="Link to Hyperlocalise Canva setup docs."
                    />
                </Button>
            </Rows>
        </div>
    );
};
