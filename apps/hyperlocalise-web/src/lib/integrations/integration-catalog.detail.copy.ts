/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntegrationCatalogSlug } from "@/lib/integrations/integration-catalog.copy";
import type { IntegrationDetailCopyDescriptors } from "@/lib/integrations/integration-catalog.types";

export const integrationDetailCopy = {
  github: {
    capabilities: [
      {
        title: {
          defaultMessage: "Repository sync",
          id: "intGitHubCapRepoTitle",
          description: "GitHub capability title for repository sync",
        },
        description: {
          defaultMessage:
            "Connect repositories and branches so Hyperlocalise always works from the code your team is shipping.",
          id: "intGitHubCapRepoDesc",
          description: "GitHub capability description for repository sync",
        },
      },
      {
        title: {
          defaultMessage: "Localization-aware PR review",
          id: "intGitHubCapPrTitle",
          description: "GitHub capability title for PR review",
        },
        description: {
          defaultMessage:
            "Inspect string changes in pull requests and flag missing translations before code merges.",
          id: "intGitHubCapPrDesc",
          description: "GitHub capability description for PR review",
        },
      },
      {
        title: {
          defaultMessage: "Agent fix proposals",
          id: "intGitHubCapAgentTitle",
          description: "GitHub capability title for agent fixes",
        },
        description: {
          defaultMessage:
            "Let agents propose localization fixes and open pull requests directly from review findings.",
          id: "intGitHubCapAgentDesc",
          description: "GitHub capability description for agent fixes",
        },
      },
      {
        title: {
          defaultMessage: "Automation triggers",
          id: "intGitHubCapAutoTitle",
          description: "GitHub capability title for automation triggers",
        },
        description: {
          defaultMessage:
            "Kick off translation workflows when branches are pushed or pull requests are opened.",
          id: "intGitHubCapAutoDesc",
          description: "GitHub capability description for automation triggers",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Catch missing translations before merge",
          id: "intGitHubWf1Title",
          description: "GitHub workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "PR opened on GitHub",
              id: "intGitHubWf1Step1",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Hyperlocalise scans strings",
              id: "intGitHubWf1Step2",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Reviewer notified in Slack",
              id: "intGitHubWf1Step3",
              description: "GitHub workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Ship localization fixes from review findings",
          id: "intGitHubWf2Title",
          description: "GitHub workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Agent flags untranslated keys",
              id: "intGitHubWf2Step1",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translations drafted in Hyperlocalise",
              id: "intGitHubWf2Step2",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Fix PR opened on GitHub",
              id: "intGitHubWf2Step3",
              description: "GitHub workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Sync release branches to your TMS",
          id: "intGitHubWf3Title",
          description: "GitHub workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Release branch pushed",
              id: "intGitHubWf3Step1",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Strings exported to Crowdin",
              id: "intGitHubWf3Step2",
              description: "GitHub workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Locale files updated via PR",
              id: "intGitHubWf3Step3",
              description: "GitHub workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Install the GitHub App",
          id: "intGitHubSetup1Title",
          description: "GitHub setup step title",
        },
        description: {
          defaultMessage:
            "Open Integrations in your workspace, find GitHub, and click Connect to install the app on your organization.",
          id: "intGitHubSetup1Desc",
          description: "GitHub setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select repositories and branches",
          id: "intGitHubSetup2Title",
          description: "GitHub setup step title",
        },
        description: {
          defaultMessage:
            "Choose which repositories Hyperlocalise can access and set the default branch for each repo.",
          id: "intGitHubSetup2Desc",
          description: "GitHub setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Enable automation triggers",
          id: "intGitHubSetup3Title",
          description: "GitHub setup step title",
        },
        description: {
          defaultMessage:
            "Turn on push and pull request triggers in Automations so workflows run when your team ships code.",
          id: "intGitHubSetup3Desc",
          description: "GitHub setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Repository connections",
          id: "intGitHubProd1Name",
          description: "GitHub product name",
        },
        description: {
          defaultMessage: "Sync repos, branches, and file context for agent-native localization.",
          id: "intGitHubProd1Desc",
          description: "GitHub product description",
        },
      },
      {
        name: {
          defaultMessage: "PR review",
          id: "intGitHubProd2Name",
          description: "GitHub product name",
        },
        description: {
          defaultMessage:
            "Surface string changes and translation gaps inside merge request workflows.",
          id: "intGitHubProd2Desc",
          description: "GitHub product description",
        },
      },
      {
        name: {
          defaultMessage: "Agent fix PRs",
          id: "intGitHubProd3Name",
          description: "GitHub product name",
        },
        description: {
          defaultMessage: "Open pull requests with proposed localization fixes from agent review.",
          id: "intGitHubProd3Desc",
          description: "GitHub product description",
        },
      },
    ],
  },
  gitlab: {
    capabilities: [
      {
        title: {
          defaultMessage: "Merge request review",
          id: "intGitLabCapMrTitle",
          description: "GitLab capability title",
        },
        description: {
          defaultMessage:
            "Review localized strings inside GitLab merge requests without switching tools.",
          id: "intGitLabCapMrDesc",
          description: "GitLab capability description",
        },
      },
      {
        title: {
          defaultMessage: "Repository context",
          id: "intGitLabCapRepoTitle",
          description: "GitLab capability title",
        },
        description: {
          defaultMessage:
            "Give agents product context from GitLab repos so translation work stays tied to code.",
          id: "intGitLabCapRepoDesc",
          description: "GitLab capability description",
        },
      },
      {
        title: {
          defaultMessage: "Localization fix proposals",
          id: "intGitLabCapFixTitle",
          description: "GitLab capability title",
        },
        description: {
          defaultMessage:
            "Propose and open merge requests with localization fixes from Hyperlocalise reviews.",
          id: "intGitLabCapFixDesc",
          description: "GitLab capability description",
        },
      },
      {
        title: {
          defaultMessage: "CI/CD integration",
          id: "intGitLabCapCiTitle",
          description: "GitLab capability title",
        },
        description: {
          defaultMessage:
            "Trigger localization checks and translation workflows from GitLab pipeline events.",
          id: "intGitLabCapCiDesc",
          description: "GitLab capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Block releases with missing translations",
          id: "intGitLabWf1Title",
          description: "GitLab workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "MR updated on GitLab",
              id: "intGitLabWf1Step1",
              description: "GitLab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Hyperlocalise checks locales",
              id: "intGitLabWf1Step2",
              description: "GitLab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Blocker posted to MR",
              id: "intGitLabWf1Step3",
              description: "GitLab workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Route review blockers to Jira",
          id: "intGitLabWf2Title",
          description: "GitLab workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Translation gap found",
              id: "intGitLabWf2Step1",
              description: "GitLab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Jira issue created",
              id: "intGitLabWf2Step2",
              description: "GitLab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Fix MR linked to issue",
              id: "intGitLabWf2Step3",
              description: "GitLab workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect your GitLab group",
          id: "intGitLabSetup1Title",
          description: "GitLab setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your GitLab group or namespace from workspace Integrations.",
          id: "intGitLabSetup1Desc",
          description: "GitLab setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select projects",
          id: "intGitLabSetup2Title",
          description: "GitLab setup step title",
        },
        description: {
          defaultMessage:
            "Choose which projects to sync and set the default branch for localization context.",
          id: "intGitLabSetup2Desc",
          description: "GitLab setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Project sync",
          id: "intGitLabProd1Name",
          description: "GitLab product name",
        },
        description: {
          defaultMessage:
            "Connect GitLab projects and branches for localization-aware development.",
          id: "intGitLabProd1Desc",
          description: "GitLab product description",
        },
      },
      {
        name: {
          defaultMessage: "MR review",
          id: "intGitLabProd2Name",
          description: "GitLab product name",
        },
        description: {
          defaultMessage: "Inspect string changes and flag translation gaps in merge requests.",
          id: "intGitLabProd2Desc",
          description: "GitLab product description",
        },
      },
    ],
  },
  slack: {
    capabilities: [
      {
        title: {
          defaultMessage: "Review notifications",
          id: "intSlackCapNotifyTitle",
          description: "Slack capability title",
        },
        description: {
          defaultMessage:
            "Route translation review requests and status updates to the channels that own the work.",
          id: "intSlackCapNotifyDesc",
          description: "Slack capability description",
        },
      },
      {
        title: {
          defaultMessage: "Thread-based coordination",
          id: "intSlackCapThreadTitle",
          description: "Slack capability title",
        },
        description: {
          defaultMessage:
            "Discuss string changes, approve translations, and resolve blockers without leaving Slack.",
          id: "intSlackCapThreadDesc",
          description: "Slack capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch alerts",
          id: "intSlackCapAlertTitle",
          description: "Slack capability title",
        },
        description: {
          defaultMessage:
            "Get notified when locales are ready, blockers appear, or launch deadlines approach.",
          id: "intSlackCapAlertDesc",
          description: "Slack capability description",
        },
      },
      {
        title: {
          defaultMessage: "Agent mentions",
          id: "intSlackCapAgentTitle",
          description: "Slack capability title",
        },
        description: {
          defaultMessage:
            "Mention the localization bot to ask about project status, string context, or review queues.",
          id: "intSlackCapAgentDesc",
          description: "Slack capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Notify reviewers when strings change",
          id: "intSlackWf1Title",
          description: "Slack workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "New strings submitted",
              id: "intSlackWf1Step1",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Review posted to #localization",
              id: "intSlackWf1Step2",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Reviewer approves in thread",
              id: "intSlackWf1Step3",
              description: "Slack workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Escalate launch blockers",
          id: "intSlackWf2Title",
          description: "Slack workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Locale fails QA check",
              id: "intSlackWf2Step1",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Alert sent to #launch",
              id: "intSlackWf2Step2",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Owner assigned in thread",
              id: "intSlackWf2Step3",
              description: "Slack workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Celebrate locale launches",
          id: "intSlackWf3Title",
          description: "Slack workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "All locales approved",
              id: "intSlackWf3Step1",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Launch summary posted",
              id: "intSlackWf3Step2",
              description: "Slack workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Team notified in channel",
              id: "intSlackWf3Step3",
              description: "Slack workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Install the Slack app",
          id: "intSlackSetup1Title",
          description: "Slack setup step title",
        },
        description: {
          defaultMessage:
            "From workspace Integrations, click Connect on Slack and authorize the app for your workspace.",
          id: "intSlackSetup1Desc",
          description: "Slack setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Choose notification channels",
          id: "intSlackSetup2Title",
          description: "Slack setup step title",
        },
        description: {
          defaultMessage:
            "Select which channels receive review requests, launch alerts, and agent notifications.",
          id: "intSlackSetup2Desc",
          description: "Slack setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Configure automations",
          id: "intSlackSetup3Title",
          description: "Slack setup step title",
        },
        description: {
          defaultMessage:
            "Set up Automations to post to Slack when translation events occur in your projects.",
          id: "intSlackSetup3Desc",
          description: "Slack setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Channel notifications",
          id: "intSlackProd1Name",
          description: "Slack product name",
        },
        description: {
          defaultMessage: "Post review requests and status updates to team channels.",
          id: "intSlackProd1Desc",
          description: "Slack product description",
        },
      },
      {
        name: {
          defaultMessage: "Thread reviews",
          id: "intSlackProd2Name",
          description: "Slack product name",
        },
        description: {
          defaultMessage: "Approve translations and resolve blockers directly in Slack threads.",
          id: "intSlackProd2Desc",
          description: "Slack product description",
        },
      },
      {
        name: {
          defaultMessage: "Localization bot",
          id: "intSlackProd3Name",
          description: "Slack product name",
        },
        description: {
          defaultMessage: "Ask the bot about project status, string context, and review queues.",
          id: "intSlackProd3Desc",
          description: "Slack product description",
        },
      },
    ],
  },
  crowdin: {
    capabilities: [
      {
        title: {
          defaultMessage: "Live project browsing",
          id: "intCrowdinCapBrowseTitle",
          description: "Crowdin capability title",
        },
        description: {
          defaultMessage:
            "Browse Crowdin projects, jobs, and translation data alongside native Hyperlocalise work.",
          id: "intCrowdinCapBrowseDesc",
          description: "Crowdin capability description",
        },
      },
      {
        title: {
          defaultMessage: "OAuth and PAT setup",
          id: "intCrowdinCapAuthTitle",
          description: "Crowdin capability title",
        },
        description: {
          defaultMessage:
            "Connect with user OAuth or personal access tokens depending on your team's security policy.",
          id: "intCrowdinCapAuthDesc",
          description: "Crowdin capability description",
        },
      },
      {
        title: {
          defaultMessage: "Agent TMS context",
          id: "intCrowdinCapAgentTitle",
          description: "Crowdin capability title",
        },
        description: {
          defaultMessage:
            "Give agents access to Crowdin project structure, strings, and job status for smarter workflows.",
          id: "intCrowdinCapAgentDesc",
          description: "Crowdin capability description",
        },
      },
      {
        title: {
          defaultMessage: "Bidirectional sync",
          id: "intCrowdinCapSyncTitle",
          description: "Crowdin capability title",
        },
        description: {
          defaultMessage:
            "Keep Hyperlocalise and Crowdin aligned so translation work does not drift between systems.",
          id: "intCrowdinCapSyncDesc",
          description: "Crowdin capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Pull latest strings from Crowdin",
          id: "intCrowdinWf1Title",
          description: "Crowdin workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Crowdin job completed",
              id: "intCrowdinWf1Step1",
              description: "Crowdin workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Strings synced to Hyperlocalise",
              id: "intCrowdinWf1Step2",
              description: "Crowdin workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Review queue updated",
              id: "intCrowdinWf1Step3",
              description: "Crowdin workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Push approved translations back",
          id: "intCrowdinWf2Title",
          description: "Crowdin workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Translations approved",
              id: "intCrowdinWf2Step1",
              description: "Crowdin workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Strings pushed to Crowdin",
              id: "intCrowdinWf2Step2",
              description: "Crowdin workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "GitHub PR opened with locale files",
              id: "intCrowdinWf2Step3",
              description: "Crowdin workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Crowdin",
          id: "intCrowdinSetup1Title",
          description: "Crowdin setup step title",
        },
        description: {
          defaultMessage:
            "Open Integrations, find Crowdin, and connect with OAuth or a personal access token.",
          id: "intCrowdinSetup1Desc",
          description: "Crowdin setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select projects",
          id: "intCrowdinSetup2Title",
          description: "Crowdin setup step title",
        },
        description: {
          defaultMessage:
            "Choose which Crowdin projects to link so agents and reviewers can browse live TMS data.",
          id: "intCrowdinSetup2Desc",
          description: "Crowdin setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Project browser",
          id: "intCrowdinProd1Name",
          description: "Crowdin product name",
        },
        description: {
          defaultMessage: "Browse Crowdin projects, files, and jobs from Hyperlocalise.",
          id: "intCrowdinProd1Desc",
          description: "Crowdin product description",
        },
      },
      {
        name: {
          defaultMessage: "String sync",
          id: "intCrowdinProd2Name",
          description: "Crowdin product name",
        },
        description: {
          defaultMessage: "Import and export translation data between Crowdin and your workspace.",
          id: "intCrowdinProd2Desc",
          description: "Crowdin product description",
        },
      },
      {
        name: {
          defaultMessage: "Agent context",
          id: "intCrowdinProd3Name",
          description: "Crowdin product name",
        },
        description: {
          defaultMessage: "Give localization agents live TMS context for smarter translation work.",
          id: "intCrowdinProd3Desc",
          description: "Crowdin product description",
        },
      },
    ],
  },
  lokalise: {
    capabilities: [
      {
        title: {
          defaultMessage: "OAuth project access",
          id: "intLokaliseCapOAuthTitle",
          description: "Lokalise capability title",
        },
        description: {
          defaultMessage:
            "Connect with user OAuth to browse Lokalise projects, tasks, and linguistic assets securely.",
          id: "intLokaliseCapOAuthDesc",
          description: "Lokalise capability description",
        },
      },
      {
        title: {
          defaultMessage: "Glossary and TM access",
          id: "intLokaliseCapGlossaryTitle",
          description: "Lokalise capability title",
        },
        description: {
          defaultMessage:
            "Surface glossaries and translation memories so agents apply consistent terminology.",
          id: "intLokaliseCapGlossaryDesc",
          description: "Lokalise capability description",
        },
      },
      {
        title: {
          defaultMessage: "Task visibility",
          id: "intLokaliseCapTaskTitle",
          description: "Lokalise capability title",
        },
        description: {
          defaultMessage:
            "See Lokalise tasks and assignment status alongside Hyperlocalise review workflows.",
          id: "intLokaliseCapTaskDesc",
          description: "Lokalise capability description",
        },
      },
      {
        title: {
          defaultMessage: "Hybrid TMS workflows",
          id: "intLokaliseCapHybridTitle",
          description: "Lokalise capability title",
        },
        description: {
          defaultMessage:
            "Run agent-native localization on top of Lokalise without forcing teams to switch tools.",
          id: "intLokaliseCapHybridDesc",
          description: "Lokalise capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Assign Lokalise tasks from agent review",
          id: "intLokaliseWf1Title",
          description: "Lokalise workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Agent flags terminology issue",
              id: "intLokaliseWf1Step1",
              description: "Lokalise workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Lokalise task created",
              id: "intLokaliseWf1Step2",
              description: "Lokalise workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translator notified",
              id: "intLokaliseWf1Step3",
              description: "Lokalise workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Import glossary for agent context",
          id: "intLokaliseWf2Title",
          description: "Lokalise workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Glossary updated in Lokalise",
              id: "intLokaliseWf2Step1",
              description: "Lokalise workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Terms synced to Hyperlocalise",
              id: "intLokaliseWf2Step2",
              description: "Lokalise workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Agents apply brand terms",
              id: "intLokaliseWf2Step3",
              description: "Lokalise workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Authorize with OAuth",
          id: "intLokaliseSetup1Title",
          description: "Lokalise setup step title",
        },
        description: {
          defaultMessage:
            "Connect Lokalise from workspace Integrations using your Lokalise account OAuth flow.",
          id: "intLokaliseSetup1Desc",
          description: "Lokalise setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Link projects",
          id: "intLokaliseSetup2Title",
          description: "Lokalise setup step title",
        },
        description: {
          defaultMessage:
            "Select Lokalise projects to expose in Hyperlocalise for browsing and agent workflows.",
          id: "intLokaliseSetup2Desc",
          description: "Lokalise setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Project browser",
          id: "intLokaliseProd1Name",
          description: "Lokalise product name",
        },
        description: {
          defaultMessage: "Browse Lokalise projects, keys, and tasks from your workspace.",
          id: "intLokaliseProd1Desc",
          description: "Lokalise product description",
        },
      },
      {
        name: {
          defaultMessage: "Linguistic assets",
          id: "intLokaliseProd2Name",
          description: "Lokalise product name",
        },
        description: {
          defaultMessage: "Access glossaries and translation memories for consistent agent output.",
          id: "intLokaliseProd2Desc",
          description: "Lokalise product description",
        },
      },
    ],
  },
  phrase: {
    capabilities: [
      {
        title: {
          defaultMessage: "Enterprise project access",
          id: "intPhraseCapProjectTitle",
          description: "Phrase capability title",
        },
        description: {
          defaultMessage:
            "Browse Phrase projects and jobs with OAuth-backed access for enterprise TMS programs.",
          id: "intPhraseCapProjectDesc",
          description: "Phrase capability description",
        },
      },
      {
        title: {
          defaultMessage: "Job status visibility",
          id: "intPhraseCapJobTitle",
          description: "Phrase capability title",
        },
        description: {
          defaultMessage:
            "See translation job progress and assignment status inside Hyperlocalise launch workflows.",
          id: "intPhraseCapJobDesc",
          description: "Phrase capability description",
        },
      },
      {
        title: {
          defaultMessage: "Agent TMS context",
          id: "intPhraseCapAgentTitle",
          description: "Phrase capability title",
        },
        description: {
          defaultMessage:
            "Give agents Phrase project structure and string data for context-aware translation.",
          id: "intPhraseCapAgentDesc",
          description: "Phrase capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch coordination",
          id: "intPhraseCapLaunchTitle",
          description: "Phrase capability title",
        },
        description: {
          defaultMessage:
            "Coordinate enterprise localization launches with Phrase jobs visible to your whole team.",
          id: "intPhraseCapLaunchDesc",
          description: "Phrase capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Track Phrase job completion",
          id: "intPhraseWf1Title",
          description: "Phrase workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Phrase job assigned",
              id: "intPhraseWf1Step1",
              description: "Phrase workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Progress synced to Hyperlocalise",
              id: "intPhraseWf1Step2",
              description: "Phrase workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Launch owner notified",
              id: "intPhraseWf1Step3",
              description: "Phrase workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Route blockers to Slack",
          id: "intPhraseWf2Title",
          description: "Phrase workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Phrase job overdue",
              id: "intPhraseWf2Step1",
              description: "Phrase workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Alert posted to Slack",
              id: "intPhraseWf2Step2",
              description: "Phrase workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "PM escalates in thread",
              id: "intPhraseWf2Step3",
              description: "Phrase workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect with OAuth",
          id: "intPhraseSetup1Title",
          description: "Phrase setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Phrase account from workspace Integrations.",
          id: "intPhraseSetup1Desc",
          description: "Phrase setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select projects and jobs",
          id: "intPhraseSetup2Title",
          description: "Phrase setup step title",
        },
        description: {
          defaultMessage:
            "Link Phrase projects so job status and string data appear in your localization workspace.",
          id: "intPhraseSetup2Desc",
          description: "Phrase setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Project browser",
          id: "intPhraseProd1Name",
          description: "Phrase product name",
        },
        description: {
          defaultMessage: "Browse Phrase projects and localization jobs from Hyperlocalise.",
          id: "intPhraseProd1Desc",
          description: "Phrase product description",
        },
      },
      {
        name: {
          defaultMessage: "Job tracking",
          id: "intPhraseProd2Name",
          description: "Phrase product name",
        },
        description: {
          defaultMessage: "Monitor translation job progress alongside launch workflows.",
          id: "intPhraseProd2Desc",
          description: "Phrase product description",
        },
      },
    ],
  },
  smartling: {
    capabilities: [
      {
        title: {
          defaultMessage: "Enterprise program visibility",
          id: "intSmartlingCapProgramTitle",
          description: "Smartling capability title",
        },
        description: {
          defaultMessage:
            "Bring large-scale Smartling programs into the same workspace your launch team uses.",
          id: "intSmartlingCapProgramDesc",
          description: "Smartling capability description",
        },
      },
      {
        title: {
          defaultMessage: "Agent workflows on TMS data",
          id: "intSmartlingCapAgentTitle",
          description: "Smartling capability title",
        },
        description: {
          defaultMessage:
            "Run agent-native localization reviews on top of existing Smartling infrastructure.",
          id: "intSmartlingCapAgentDesc",
          description: "Smartling capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch coordination",
          id: "intSmartlingCapLaunchTitle",
          description: "Smartling capability title",
        },
        description: {
          defaultMessage:
            "Coordinate multi-locale launches with Smartling job status visible to stakeholders.",
          id: "intSmartlingCapLaunchDesc",
          description: "Smartling capability description",
        },
      },
      {
        title: {
          defaultMessage: "Review layer",
          id: "intSmartlingCapReviewTitle",
          description: "Smartling capability title",
        },
        description: {
          defaultMessage: "Add Hyperlocalise review and QA on top of Smartling translation output.",
          id: "intSmartlingCapReviewDesc",
          description: "Smartling capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "QA Smartling output before launch",
          id: "intSmartlingWf1Title",
          description: "Smartling workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Smartling job completed",
              id: "intSmartlingWf1Step1",
              description: "Smartling workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Strings imported for review",
              id: "intSmartlingWf1Step2",
              description: "Smartling workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "QA findings routed to reviewers",
              id: "intSmartlingWf1Step3",
              description: "Smartling workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Smartling",
          id: "intSmartlingSetup1Title",
          description: "Smartling setup step title",
        },
        description: {
          defaultMessage:
            "Link your Smartling account from workspace Integrations to enable program visibility.",
          id: "intSmartlingSetup1Desc",
          description: "Smartling setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Program browser",
          id: "intSmartlingProd1Name",
          description: "Smartling product name",
        },
        description: {
          defaultMessage: "Browse Smartling projects and jobs from your Hyperlocalise workspace.",
          id: "intSmartlingProd1Desc",
          description: "Smartling product description",
        },
      },
      {
        name: {
          defaultMessage: "Review layer",
          id: "intSmartlingProd2Name",
          description: "Smartling product name",
        },
        description: {
          defaultMessage: "Add agent-native QA and review on top of Smartling translations.",
          id: "intSmartlingProd2Desc",
          description: "Smartling product description",
        },
      },
    ],
  },
  contentful: {
    capabilities: [
      {
        title: {
          defaultMessage: "Space and environment targeting",
          id: "intContentfulCapSpaceTitle",
          description: "Contentful capability title",
        },
        description: {
          defaultMessage:
            "Connect specific Contentful spaces and environments for precise content localization.",
          id: "intContentfulCapSpaceDesc",
          description: "Contentful capability description",
        },
      },
      {
        title: {
          defaultMessage: "Agentic article translation",
          id: "intContentfulCapAgentTitle",
          description: "Contentful capability title",
        },
        description: {
          defaultMessage:
            "Let agents translate structured content entries while preserving field types and relationships.",
          id: "intContentfulCapAgentDesc",
          description: "Contentful capability description",
        },
      },
      {
        title: {
          defaultMessage: "Draft writeback",
          id: "intContentfulCapWritebackTitle",
          description: "Contentful capability title",
        },
        description: {
          defaultMessage:
            "Write localized drafts back to Contentful so editors can review before publishing.",
          id: "intContentfulCapWritebackDesc",
          description: "Contentful capability description",
        },
      },
      {
        title: {
          defaultMessage: "Content-type aware",
          id: "intContentfulCapTypeTitle",
          description: "Contentful capability title",
        },
        description: {
          defaultMessage:
            "Target specific content types so agents only translate the fields that need localization.",
          id: "intContentfulCapTypeDesc",
          description: "Contentful capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Translate blog posts to new locales",
          id: "intContentfulWf1Title",
          description: "Contentful workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Article published in English",
              id: "intContentfulWf1Step1",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Agent drafts German version",
              id: "intContentfulWf1Step2",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Draft saved to Contentful",
              id: "intContentfulWf1Step3",
              description: "Contentful workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Localize product pages for launch",
          id: "intContentfulWf2Title",
          description: "Contentful workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "New product entry created",
              id: "intContentfulWf2Step1",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translations drafted for 5 locales",
              id: "intContentfulWf2Step2",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Editor reviews drafts in Contentful",
              id: "intContentfulWf2Step3",
              description: "Contentful workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Keep SEO metadata localized",
          id: "intContentfulWf3Title",
          description: "Contentful workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "SEO fields updated",
              id: "intContentfulWf3Step1",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Ahrefs keywords applied per locale",
              id: "intContentfulWf3Step2",
              description: "Contentful workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Localized meta written back",
              id: "intContentfulWf3Step3",
              description: "Contentful workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect your space",
          id: "intContentfulSetup1Title",
          description: "Contentful setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Contentful space from workspace Integrations.",
          id: "intContentfulSetup1Desc",
          description: "Contentful setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select environment and content types",
          id: "intContentfulSetup2Title",
          description: "Contentful setup step title",
        },
        description: {
          defaultMessage:
            "Choose the environment and content types agents should translate and write back to.",
          id: "intContentfulSetup2Desc",
          description: "Contentful setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Configure writeback",
          id: "intContentfulSetup3Title",
          description: "Contentful setup step title",
        },
        description: {
          defaultMessage:
            "Set whether agents write drafts or published entries, and which locales to target.",
          id: "intContentfulSetup3Desc",
          description: "Contentful setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Space connections",
          id: "intContentfulProd1Name",
          description: "Contentful product name",
        },
        description: {
          defaultMessage: "Link Contentful spaces and environments for targeted localization.",
          id: "intContentfulProd1Desc",
          description: "Contentful product description",
        },
      },
      {
        name: {
          defaultMessage: "Entry translation",
          id: "intContentfulProd2Name",
          description: "Contentful product name",
        },
        description: {
          defaultMessage: "Translate structured entries while preserving field types and links.",
          id: "intContentfulProd2Desc",
          description: "Contentful product description",
        },
      },
      {
        name: {
          defaultMessage: "Draft writeback",
          id: "intContentfulProd3Name",
          description: "Contentful product name",
        },
        description: {
          defaultMessage: "Write localized drafts back for editor review before publishing.",
          id: "intContentfulProd3Desc",
          description: "Contentful product description",
        },
      },
    ],
  },
  canva: {
    capabilities: [
      {
        title: {
          defaultMessage: "Design asset localization",
          id: "intCanvaCapAssetTitle",
          description: "Canva capability title",
        },
        description: {
          defaultMessage:
            "Localize text layers and campaign creative in Canva designs without rebuilding layouts.",
          id: "intCanvaCapAssetDesc",
          description: "Canva capability description",
        },
      },
      {
        title: {
          defaultMessage: "Campaign creative workflows",
          id: "intCanvaCapCampaignTitle",
          description: "Canva capability title",
        },
        description: {
          defaultMessage:
            "Adapt marketing campaigns for new markets while keeping brand visuals consistent.",
          id: "intCanvaCapCampaignDesc",
          description: "Canva capability description",
        },
      },
      {
        title: {
          defaultMessage: "Brand consistency",
          id: "intCanvaCapBrandTitle",
          description: "Canva capability title",
        },
        description: {
          defaultMessage:
            "Apply glossary and style guide terms to design copy for on-brand localized creative.",
          id: "intCanvaCapBrandDesc",
          description: "Canva capability description",
        },
      },
      {
        title: {
          defaultMessage: "Visual launch coordination",
          id: "intCanvaCapLaunchTitle",
          description: "Canva capability title",
        },
        description: {
          defaultMessage:
            "Keep visual launch assets in the same localization operating system as product copy.",
          id: "intCanvaCapLaunchDesc",
          description: "Canva capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Localize campaign banners for new markets",
          id: "intCanvaWf1Title",
          description: "Canva workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Campaign design approved",
              id: "intCanvaWf1Step1",
              description: "Canva workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Text layers translated per locale",
              id: "intCanvaWf1Step2",
              description: "Canva workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Localized versions saved in Canva",
              id: "intCanvaWf1Step3",
              description: "Canva workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Adapt social posts for regional launch",
          id: "intCanvaWf2Title",
          description: "Canva workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Social template selected",
              id: "intCanvaWf2Step1",
              description: "Canva workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Copy localized with brand glossary",
              id: "intCanvaWf2Step2",
              description: "Canva workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Regional variants ready to publish",
              id: "intCanvaWf2Step3",
              description: "Canva workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Canva",
          id: "intCanvaSetup1Title",
          description: "Canva setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Canva account from workspace Integrations.",
          id: "intCanvaSetup1Desc",
          description: "Canva setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select brand kits and folders",
          id: "intCanvaSetup2Title",
          description: "Canva setup step title",
        },
        description: {
          defaultMessage:
            "Choose which Canva brand kits and design folders to include in localization workflows.",
          id: "intCanvaSetup2Desc",
          description: "Canva setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Design localization",
          id: "intCanvaProd1Name",
          description: "Canva product name",
        },
        description: {
          defaultMessage: "Translate text layers in Canva designs for market-specific creative.",
          id: "intCanvaProd1Desc",
          description: "Canva product description",
        },
      },
      {
        name: {
          defaultMessage: "Campaign adaptation",
          id: "intCanvaProd2Name",
          description: "Canva product name",
        },
        description: {
          defaultMessage:
            "Adapt marketing campaigns for new locales while preserving brand visuals.",
          id: "intCanvaProd2Desc",
          description: "Canva product description",
        },
      },
    ],
  },
  intercom: {
    capabilities: [
      {
        title: {
          defaultMessage: "Help center localization",
          id: "intIntercomCapHelpTitle",
          description: "Intercom capability title",
        },
        description: {
          defaultMessage:
            "Translate support articles and help center content for global customer bases.",
          id: "intIntercomCapHelpDesc",
          description: "Intercom capability description",
        },
      },
      {
        title: {
          defaultMessage: "In-product messaging",
          id: "intIntercomCapMessageTitle",
          description: "Intercom capability title",
        },
        description: {
          defaultMessage:
            "Localize tours, banners, and in-app messages so onboarding feels native in every market.",
          id: "intIntercomCapMessageDesc",
          description: "Intercom capability description",
        },
      },
      {
        title: {
          defaultMessage: "Consistent review process",
          id: "intIntercomCapReviewTitle",
          description: "Intercom capability title",
        },
        description: {
          defaultMessage:
            "Run support content through the same review workflow as product strings.",
          id: "intIntercomCapReviewDesc",
          description: "Intercom capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch alignment",
          id: "intIntercomCapLaunchTitle",
          description: "Intercom capability title",
        },
        description: {
          defaultMessage:
            "Ship localized support content alongside product launches in new markets.",
          id: "intIntercomCapLaunchDesc",
          description: "Intercom capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Localize help articles for market launch",
          id: "intIntercomWf1Title",
          description: "Intercom workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "New feature ships",
              id: "intIntercomWf1Step1",
              description: "Intercom workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Help articles drafted in 4 locales",
              id: "intIntercomWf1Step2",
              description: "Intercom workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Articles published in Intercom",
              id: "intIntercomWf1Step3",
              description: "Intercom workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Translate onboarding tours",
          id: "intIntercomWf2Title",
          description: "Intercom workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Tour copy updated in English",
              id: "intIntercomWf2Step1",
              description: "Intercom workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translations reviewed in Hyperlocalise",
              id: "intIntercomWf2Step2",
              description: "Intercom workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Localized tour pushed to Intercom",
              id: "intIntercomWf2Step3",
              description: "Intercom workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Intercom",
          id: "intIntercomSetup1Title",
          description: "Intercom setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Intercom workspace from Integrations.",
          id: "intIntercomSetup1Desc",
          description: "Intercom setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select content types",
          id: "intIntercomSetup2Title",
          description: "Intercom setup step title",
        },
        description: {
          defaultMessage:
            "Choose which Intercom content types to localize: articles, messages, or tours.",
          id: "intIntercomSetup2Desc",
          description: "Intercom setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Help center",
          id: "intIntercomProd1Name",
          description: "Intercom product name",
        },
        description: {
          defaultMessage: "Translate support articles and documentation for global customers.",
          id: "intIntercomProd1Desc",
          description: "Intercom product description",
        },
      },
      {
        name: {
          defaultMessage: "In-product messaging",
          id: "intIntercomProd2Name",
          description: "Intercom product name",
        },
        description: {
          defaultMessage: "Localize tours, banners, and onboarding messages per market.",
          id: "intIntercomProd2Desc",
          description: "Intercom product description",
        },
      },
    ],
  },
  ahrefs: {
    capabilities: [
      {
        title: {
          defaultMessage: "Keyword research per locale",
          id: "intAhrefsCapKeywordTitle",
          description: "Ahrefs capability title",
        },
        description: {
          defaultMessage:
            "Feed locale-specific keyword data into content planning and translation prioritization.",
          id: "intAhrefsCapKeywordDesc",
          description: "Ahrefs capability description",
        },
      },
      {
        title: {
          defaultMessage: "Ranking context",
          id: "intAhrefsCapRankTitle",
          description: "Ahrefs capability title",
        },
        description: {
          defaultMessage:
            "See how pages rank in target markets to prioritize which content to localize first.",
          id: "intAhrefsCapRankDesc",
          description: "Ahrefs capability description",
        },
      },
      {
        title: {
          defaultMessage: "Content planning",
          id: "intAhrefsCapPlanTitle",
          description: "Ahrefs capability title",
        },
        description: {
          defaultMessage:
            "Use search data to decide which pages and topics deserve localization investment.",
          id: "intAhrefsCapPlanDesc",
          description: "Ahrefs capability description",
        },
      },
      {
        title: {
          defaultMessage: "SEO-informed translation",
          id: "intAhrefsCapTranslateTitle",
          description: "Ahrefs capability title",
        },
        description: {
          defaultMessage:
            "Give agents keyword context so localized content targets real search intent.",
          id: "intAhrefsCapTranslateDesc",
          description: "Ahrefs capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Prioritize pages for localization",
          id: "intAhrefsWf1Title",
          description: "Ahrefs workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Ahrefs ranking data imported",
              id: "intAhrefsWf1Step1",
              description: "Ahrefs workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "High-traffic pages flagged",
              id: "intAhrefsWf1Step2",
              description: "Ahrefs workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Localization queue prioritized",
              id: "intAhrefsWf1Step3",
              description: "Ahrefs workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Optimize localized meta descriptions",
          id: "intAhrefsWf2Title",
          description: "Ahrefs workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Target keywords identified",
              id: "intAhrefsWf2Step1",
              description: "Ahrefs workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Agent drafts SEO-aware copy",
              id: "intAhrefsWf2Step2",
              description: "Ahrefs workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Meta written to Contentful",
              id: "intAhrefsWf2Step3",
              description: "Ahrefs workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Ahrefs",
          id: "intAhrefsSetup1Title",
          description: "Ahrefs setup step title",
        },
        description: {
          defaultMessage:
            "Link your Ahrefs account from workspace Integrations to import keyword and ranking data.",
          id: "intAhrefsSetup1Desc",
          description: "Ahrefs setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select target markets",
          id: "intAhrefsSetup2Title",
          description: "Ahrefs setup step title",
        },
        description: {
          defaultMessage: "Choose which country and language combinations to pull search data for.",
          id: "intAhrefsSetup2Desc",
          description: "Ahrefs setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Keyword research",
          id: "intAhrefsProd1Name",
          description: "Ahrefs product name",
        },
        description: {
          defaultMessage: "Import locale-specific keyword data for content planning.",
          id: "intAhrefsProd1Desc",
          description: "Ahrefs product description",
        },
      },
      {
        name: {
          defaultMessage: "Ranking insights",
          id: "intAhrefsProd2Name",
          description: "Ahrefs product name",
        },
        description: {
          defaultMessage: "See page rankings per market to prioritize localization work.",
          id: "intAhrefsProd2Desc",
          description: "Ahrefs product description",
        },
      },
    ],
  },
  semrush: {
    capabilities: [
      {
        title: {
          defaultMessage: "Competitive research",
          id: "intSemrushCapCompTitle",
          description: "Semrush capability title",
        },
        description: {
          defaultMessage:
            "Understand competitor content strategies in target markets before localizing.",
          id: "intSemrushCapCompDesc",
          description: "Semrush capability description",
        },
      },
      {
        title: {
          defaultMessage: "Keyword intelligence",
          id: "intSemrushCapKeywordTitle",
          description: "Semrush capability title",
        },
        description: {
          defaultMessage:
            "Pull keyword and ranking data into Hyperlocalise for search-informed translation.",
          id: "intSemrushCapKeywordDesc",
          description: "Semrush capability description",
        },
      },
      {
        title: {
          defaultMessage: "Market prioritization",
          id: "intSemrushCapMarketTitle",
          description: "Semrush capability title",
        },
        description: {
          defaultMessage: "Use SEO signals to decide which markets and pages to localize first.",
          id: "intSemrushCapMarketDesc",
          description: "Semrush capability description",
        },
      },
      {
        title: {
          defaultMessage: "Content optimization",
          id: "intSemrushCapOptimizeTitle",
          description: "Semrush capability title",
        },
        description: {
          defaultMessage: "Optimize localized content for search intent in each target language.",
          id: "intSemrushCapOptimizeDesc",
          description: "Semrush capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Plan multilingual content calendar",
          id: "intSemrushWf1Title",
          description: "Semrush workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Semrush keyword gaps identified",
              id: "intSemrushWf1Step1",
              description: "Semrush workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Content briefs created per locale",
              id: "intSemrushWf1Step2",
              description: "Semrush workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translation queue populated",
              id: "intSemrushWf1Step3",
              description: "Semrush workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Benchmark competitor localization",
          id: "intSemrushWf2Title",
          description: "Semrush workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Competitor pages analyzed",
              id: "intSemrushWf2Step1",
              description: "Semrush workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Gap report generated",
              id: "intSemrushWf2Step2",
              description: "Semrush workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Priority pages added to queue",
              id: "intSemrushWf2Step3",
              description: "Semrush workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Semrush",
          id: "intSemrushSetup1Title",
          description: "Semrush setup step title",
        },
        description: {
          defaultMessage:
            "Link your Semrush account from workspace Integrations to import SEO intelligence.",
          id: "intSemrushSetup1Desc",
          description: "Semrush setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Keyword intelligence",
          id: "intSemrushProd1Name",
          description: "Semrush product name",
        },
        description: {
          defaultMessage: "Import keyword and ranking data for locale-aware content planning.",
          id: "intSemrushProd1Desc",
          description: "Semrush product description",
        },
      },
      {
        name: {
          defaultMessage: "Competitive analysis",
          id: "intSemrushProd2Name",
          description: "Semrush product name",
        },
        description: {
          defaultMessage: "Benchmark competitor content strategies in target markets.",
          id: "intSemrushProd2Desc",
          description: "Semrush product description",
        },
      },
    ],
  },
  hyperlab: {
    capabilities: [
      {
        title: {
          defaultMessage: "Controlled experiments",
          id: "intHyperlabCapExperimentTitle",
          description: "Hyperlab capability title",
        },
        description: {
          defaultMessage:
            "Test localized copy, layouts, or market-specific variants with a subset of users first.",
          id: "intHyperlabCapExperimentDesc",
          description: "Hyperlab capability description",
        },
      },
      {
        title: {
          defaultMessage: "No separate feature flags",
          id: "intHyperlabCapFlagsTitle",
          description: "Hyperlab capability title",
        },
        description: {
          defaultMessage:
            "Run experiments inside Hyperlocalise without bolting on a separate feature-flag stack.",
          id: "intHyperlabCapFlagsDesc",
          description: "Hyperlab capability description",
        },
      },
      {
        title: {
          defaultMessage: "Locale-aware variants",
          id: "intHyperlabCapLocaleTitle",
          description: "Hyperlab capability title",
        },
        description: {
          defaultMessage:
            "Test different translations or market-specific messaging before global rollout.",
          id: "intHyperlabCapLocaleDesc",
          description: "Hyperlab capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch confidence",
          id: "intHyperlabCapLaunchTitle",
          description: "Hyperlab capability title",
        },
        description: {
          defaultMessage:
            "Validate localized experiences with real users before committing to a full market launch.",
          id: "intHyperlabCapLaunchDesc",
          description: "Hyperlab capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "A/B test translated headlines",
          id: "intHyperlabWf1Title",
          description: "Hyperlab workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Two headline variants created",
              id: "intHyperlabWf1Step1",
              description: "Hyperlab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Experiment shown to 10% of users",
              id: "intHyperlabWf1Step2",
              description: "Hyperlab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Winning variant rolled out",
              id: "intHyperlabWf1Step3",
              description: "Hyperlab workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Validate new market copy before launch",
          id: "intHyperlabWf2Title",
          description: "Hyperlab workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "German copy drafted",
              id: "intHyperlabWf2Step1",
              description: "Hyperlab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Shown to German beta users",
              id: "intHyperlabWf2Step2",
              description: "Hyperlab workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Full DE launch approved",
              id: "intHyperlabWf2Step3",
              description: "Hyperlab workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Enable Hyperlab",
          id: "intHyperlabSetup1Title",
          description: "Hyperlab setup step title",
        },
        description: {
          defaultMessage:
            "Hyperlab is included with Hyperlocalise. Enable it from your workspace Experiments settings.",
          id: "intHyperlabSetup1Desc",
          description: "Hyperlab setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Create your first experiment",
          id: "intHyperlabSetup2Title",
          description: "Hyperlab setup step title",
        },
        description: {
          defaultMessage:
            "Define variants, set audience targeting, and choose which localized content to test.",
          id: "intHyperlabSetup2Desc",
          description: "Hyperlab setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "A/B experiments",
          id: "intHyperlabProd1Name",
          description: "Hyperlab product name",
        },
        description: {
          defaultMessage: "Test localized copy and layouts with a subset of users before rollout.",
          id: "intHyperlabProd1Desc",
          description: "Hyperlab product description",
        },
      },
      {
        name: {
          defaultMessage: "Market validation",
          id: "intHyperlabProd2Name",
          description: "Hyperlab product name",
        },
        description: {
          defaultMessage: "Validate new market experiences with real users before full launch.",
          id: "intHyperlabProd2Desc",
          description: "Hyperlab product description",
        },
      },
    ],
  },
  jira: {
    capabilities: [
      {
        title: {
          defaultMessage: "Issue creation from blockers",
          id: "intJiraCapIssueTitle",
          description: "Jira capability title",
        },
        description: {
          defaultMessage:
            "Turn translation blockers into Jira issues so engineering can track and resolve them.",
          id: "intJiraCapIssueDesc",
          description: "Jira capability description",
        },
      },
      {
        title: {
          defaultMessage: "Workflow sync",
          id: "intJiraCapSyncTitle",
          description: "Jira capability title",
        },
        description: {
          defaultMessage:
            "Keep localization tasks synchronized with your existing Jira boards and sprints.",
          id: "intJiraCapSyncDesc",
          description: "Jira capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch tracking",
          id: "intJiraCapLaunchTitle",
          description: "Jira capability title",
        },
        description: {
          defaultMessage:
            "Track locale launch milestones alongside engineering deliverables in Jira.",
          id: "intJiraCapLaunchDesc",
          description: "Jira capability description",
        },
      },
      {
        title: {
          defaultMessage: "Cross-team visibility",
          id: "intJiraCapVisibilityTitle",
          description: "Jira capability title",
        },
        description: {
          defaultMessage:
            "Give product and engineering teams visibility into localization blockers.",
          id: "intJiraCapVisibilityDesc",
          description: "Jira capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Create Jira ticket from translation blocker",
          id: "intJiraWf1Title",
          description: "Jira workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Missing string flagged",
              id: "intJiraWf1Step1",
              description: "Jira workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Jira issue auto-created",
              id: "intJiraWf1Step2",
              description: "Jira workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Engineer assigned and notified",
              id: "intJiraWf1Step3",
              description: "Jira workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Track locale launch in sprint",
          id: "intJiraWf2Title",
          description: "Jira workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Launch epic created",
              id: "intJiraWf2Step1",
              description: "Jira workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Locale tasks added to sprint",
              id: "intJiraWf2Step2",
              description: "Jira workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Progress synced to Hyperlocalise",
              id: "intJiraWf2Step3",
              description: "Jira workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Jira",
          id: "intJiraSetup1Title",
          description: "Jira setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Jira workspace from Integrations.",
          id: "intJiraSetup1Desc",
          description: "Jira setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Map projects and issue types",
          id: "intJiraSetup2Title",
          description: "Jira setup step title",
        },
        description: {
          defaultMessage:
            "Select which Jira projects and issue types to use for localization blockers.",
          id: "intJiraSetup2Desc",
          description: "Jira setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Issue creation",
          id: "intJiraProd1Name",
          description: "Jira product name",
        },
        description: {
          defaultMessage: "Create Jira issues automatically from translation blockers.",
          id: "intJiraProd1Desc",
          description: "Jira product description",
        },
      },
      {
        name: {
          defaultMessage: "Workflow sync",
          id: "intJiraProd2Name",
          description: "Jira product name",
        },
        description: {
          defaultMessage: "Keep localization tasks synchronized with Jira boards and sprints.",
          id: "intJiraProd2Desc",
          description: "Jira product description",
        },
      },
    ],
  },
  linear: {
    capabilities: [
      {
        title: {
          defaultMessage: "Issue sync",
          id: "intLinearCapIssueTitle",
          description: "Linear capability title",
        },
        description: {
          defaultMessage:
            "Turn translation blockers into Linear issues without losing product context.",
          id: "intLinearCapIssueDesc",
          description: "Linear capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch coordination",
          id: "intLinearCapLaunchTitle",
          description: "Linear capability title",
        },
        description: {
          defaultMessage: "Track localization launch tasks alongside product delivery in Linear.",
          id: "intLinearCapLaunchDesc",
          description: "Linear capability description",
        },
      },
      {
        title: {
          defaultMessage: "Team visibility",
          id: "intLinearCapVisibilityTitle",
          description: "Linear capability title",
        },
        description: {
          defaultMessage:
            "Give product teams visibility into localization blockers in their existing workflow.",
          id: "intLinearCapVisibilityDesc",
          description: "Linear capability description",
        },
      },
      {
        title: {
          defaultMessage: "Fast issue creation",
          id: "intLinearCapFastTitle",
          description: "Linear capability title",
        },
        description: {
          defaultMessage:
            "Create Linear issues from review findings with one click from Hyperlocalise.",
          id: "intLinearCapFastDesc",
          description: "Linear capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "File Linear issue from review finding",
          id: "intLinearWf1Title",
          description: "Linear workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "QA issue found in review",
              id: "intLinearWf1Step1",
              description: "Linear workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Linear issue created",
              id: "intLinearWf1Step2",
              description: "Linear workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Owner notified in Linear",
              id: "intLinearWf1Step3",
              description: "Linear workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Linear",
          id: "intLinearSetup1Title",
          description: "Linear setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Linear workspace from Integrations.",
          id: "intLinearSetup1Desc",
          description: "Linear setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Issue creation",
          id: "intLinearProd1Name",
          description: "Linear product name",
        },
        description: {
          defaultMessage: "Create Linear issues from translation blockers and review findings.",
          id: "intLinearProd1Desc",
          description: "Linear product description",
        },
      },
      {
        name: {
          defaultMessage: "Launch tracking",
          id: "intLinearProd2Name",
          description: "Linear product name",
        },
        description: {
          defaultMessage: "Track localization launch tasks in your product delivery pipeline.",
          id: "intLinearProd2Desc",
          description: "Linear product description",
        },
      },
    ],
  },
  notion: {
    capabilities: [
      {
        title: {
          defaultMessage: "Style guide import",
          id: "intNotionCapStyleTitle",
          description: "Notion capability title",
        },
        description: {
          defaultMessage:
            "Import brand style guides and writing rules from Notion for agent context.",
          id: "intNotionCapStyleDesc",
          description: "Notion capability description",
        },
      },
      {
        title: {
          defaultMessage: "Glossary sync",
          id: "intNotionCapGlossaryTitle",
          description: "Notion capability title",
        },
        description: {
          defaultMessage:
            "Pull glossary terms and market notes from Notion so agents apply consistent terminology.",
          id: "intNotionCapGlossaryDesc",
          description: "Notion capability description",
        },
      },
      {
        title: {
          defaultMessage: "Market guidance",
          id: "intNotionCapMarketTitle",
          description: "Notion capability title",
        },
        description: {
          defaultMessage:
            "Give agents locale-specific market notes and cultural guidance from your knowledge base.",
          id: "intNotionCapMarketDesc",
          description: "Notion capability description",
        },
      },
      {
        title: {
          defaultMessage: "Living documentation",
          id: "intNotionCapDocsTitle",
          description: "Notion capability title",
        },
        description: {
          defaultMessage:
            "Keep agent context in sync with your team's living docs without manual copy-paste.",
          id: "intNotionCapDocsDesc",
          description: "Notion capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Sync brand glossary to agents",
          id: "intNotionWf1Title",
          description: "Notion workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Glossary updated in Notion",
              id: "intNotionWf1Step1",
              description: "Notion workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Terms synced to Hyperlocalise",
              id: "intNotionWf1Step2",
              description: "Notion workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Agents apply brand terms",
              id: "intNotionWf1Step3",
              description: "Notion workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Import market launch briefs",
          id: "intNotionWf2Title",
          description: "Notion workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Launch brief published in Notion",
              id: "intNotionWf2Step1",
              description: "Notion workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Context imported for agents",
              id: "intNotionWf2Step2",
              description: "Notion workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translations follow market guidance",
              id: "intNotionWf2Step3",
              description: "Notion workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Notion",
          id: "intNotionSetup1Title",
          description: "Notion setup step title",
        },
        description: {
          defaultMessage:
            "Authorize Hyperlocalise to access your Notion workspace from Integrations.",
          id: "intNotionSetup1Desc",
          description: "Notion setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Select pages to import",
          id: "intNotionSetup2Title",
          description: "Notion setup step title",
        },
        description: {
          defaultMessage:
            "Choose which Notion pages contain style guides, glossaries, or market notes.",
          id: "intNotionSetup2Desc",
          description: "Notion setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Style guide import",
          id: "intNotionProd1Name",
          description: "Notion product name",
        },
        description: {
          defaultMessage: "Import brand and writing guidelines from Notion for agent context.",
          id: "intNotionProd1Desc",
          description: "Notion product description",
        },
      },
      {
        name: {
          defaultMessage: "Glossary sync",
          id: "intNotionProd2Name",
          description: "Notion product name",
        },
        description: {
          defaultMessage: "Keep glossary terms in sync between Notion and Hyperlocalise.",
          id: "intNotionProd2Desc",
          description: "Notion product description",
        },
      },
    ],
  },
  resend: {
    capabilities: [
      {
        title: {
          defaultMessage: "Transactional email localization",
          id: "intResendCapEmailTitle",
          description: "Resend capability title",
        },
        description: {
          defaultMessage:
            "Send localized transactional emails from the same workspace where copy is reviewed.",
          id: "intResendCapEmailDesc",
          description: "Resend capability description",
        },
      },
      {
        title: {
          defaultMessage: "Template management",
          id: "intResendCapTemplateTitle",
          description: "Resend capability title",
        },
        description: {
          defaultMessage:
            "Manage email templates per locale with translation memory and review history behind them.",
          id: "intResendCapTemplateDesc",
          description: "Resend capability description",
        },
      },
      {
        title: {
          defaultMessage: "Launch-ready emails",
          id: "intResendCapLaunchTitle",
          description: "Resend capability title",
        },
        description: {
          defaultMessage:
            "Ship localized welcome, reset, and notification emails alongside product launches.",
          id: "intResendCapLaunchDesc",
          description: "Resend capability description",
        },
      },
      {
        title: {
          defaultMessage: "Review before send",
          id: "intResendCapReviewTitle",
          description: "Resend capability title",
        },
        description: {
          defaultMessage:
            "Run email copy through the same review process as product strings before sending.",
          id: "intResendCapReviewDesc",
          description: "Resend capability description",
        },
      },
    ],
    workflows: [
      {
        title: {
          defaultMessage: "Localize welcome email for new market",
          id: "intResendWf1Title",
          description: "Resend workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Welcome template drafted",
              id: "intResendWf1Step1",
              description: "Resend workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Translated and reviewed",
              id: "intResendWf1Step2",
              description: "Resend workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Sent via Resend per locale",
              id: "intResendWf1Step3",
              description: "Resend workflow step label",
            },
          },
        ],
      },
      {
        title: {
          defaultMessage: "Update password reset copy globally",
          id: "intResendWf2Title",
          description: "Resend workflow example title",
        },
        steps: [
          {
            label: {
              defaultMessage: "Reset email copy updated",
              id: "intResendWf2Step1",
              description: "Resend workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "All locale variants synced",
              id: "intResendWf2Step2",
              description: "Resend workflow step label",
            },
          },
          {
            label: {
              defaultMessage: "Templates pushed to Resend",
              id: "intResendWf2Step3",
              description: "Resend workflow step label",
            },
          },
        ],
      },
    ],
    setupSteps: [
      {
        title: {
          defaultMessage: "Connect Resend",
          id: "intResendSetup1Title",
          description: "Resend setup step title",
        },
        description: {
          defaultMessage:
            "Add your Resend API key from workspace Integrations to enable email delivery.",
          id: "intResendSetup1Desc",
          description: "Resend setup step description",
        },
      },
      {
        title: {
          defaultMessage: "Configure email templates",
          id: "intResendSetup2Title",
          description: "Resend setup step title",
        },
        description: {
          defaultMessage:
            "Set up email templates per locale and link them to your localization projects.",
          id: "intResendSetup2Desc",
          description: "Resend setup step description",
        },
      },
    ],
    products: [
      {
        name: {
          defaultMessage: "Transactional email",
          id: "intResendProd1Name",
          description: "Resend product name",
        },
        description: {
          defaultMessage: "Send localized transactional emails through Resend.",
          id: "intResendProd1Desc",
          description: "Resend product description",
        },
      },
      {
        name: {
          defaultMessage: "Template localization",
          id: "intResendProd2Name",
          description: "Resend product name",
        },
        description: {
          defaultMessage: "Manage and review email templates per locale before sending.",
          id: "intResendProd2Desc",
          description: "Resend product description",
        },
      },
    ],
  },
} as const satisfies Partial<Record<IntegrationCatalogSlug, IntegrationDetailCopyDescriptors>>;

export function getIntegrationDetailCopyDescriptors(
  slug: string,
): IntegrationDetailCopyDescriptors | null {
  if (!(slug in integrationDetailCopy)) {
    return null;
  }

  return integrationDetailCopy[slug as keyof typeof integrationDetailCopy];
}
