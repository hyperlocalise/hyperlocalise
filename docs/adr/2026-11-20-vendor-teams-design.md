# Vendor teams: outside people who see only the tasks they are given

**Status:** Accepted

Ships in two pull requests. The first, on top of the two in [A file's human steps in order](2026-11-16-task-steps-in-order-design.md), adds vendor teams and lets a task be given to a person in one. The second lets a task be given to a vendor team and its manager hand it on.

This record replaces the first design in the same pull request, a Vendor role (see Alternatives considered).

## Context

A customer wants a file machine translated and then post-edited or proofread by an outside vendor: a freelancer, or people at an agency. The vendor must see that work and nothing else in the workspace. An agency has its own people in different jobs: a project manager, translators and reviewers.

Today that is not possible. Every role, down to **Member**, can read the member list with email addresses, every dictionary and project template, workspace-level glossaries, and every project of the teams the person is in. A person in no team still sees most of that. And a task given to someone who is not on the project's team shows in their **My jobs** but cannot be opened, while the public API refuses to give such a person a task at all.

Other platforms handle vendors in three ways: a linked organization of the vendor's own, a restricted user inside the customer's account, or a group with its own manager inside the customer's account. On all of them a vendor's person sees assigned work only, and reads the translation memory and glossary inside the editor for that work. The group with its own manager fits what this platform has, since it already has teams with managers.

## Words used here

- **Task:** a job for a person on one file, for some languages, at one step (post-edit or proofread), with an owner and a due date.
- **Open task:** a task its owner can work on now (status **Waiting for review**). A **waiting** task comes after another job that has not finished. A **finished** task was marked done or cancelled.
- **Team rule:** today's rule for where a person may work: the projects of the teams they are in, or every project for admins and localization managers.
- **Vendor team:** a team marked as an outside vendor's. Its people are **vendor people**.
- **Gate:** one place in the code that every request passes through, which refuses vendor people unless the route was opened on purpose.

## Decision

**A vendor is a team, not a role.** A team is a vendor team or not, chosen when it is made, and that cannot be changed later. A freelancer is a vendor team of one.

**Being in a vendor team is what shuts a person out of the workspace.** Vendor people keep an ordinary role (Translator, Reviewer, or any other), and the role decides what they may do inside a task. Everything they can see comes from the open tasks they own, and ends when a task is finished or given to someone else.

### What vendor people can see and do

| Where | What | Limits |
|---|---|---|
| **My jobs** | Their open and waiting tasks: title, project name, file, languages, step, status, due date. | Only the **Assigned** list. A finished or reassigned task leaves it. |
| The task's page | The same details, **Open Editor** and **Mark done**. After **Mark done**, or when the task has ended or moved to someone else, they are taken back to **My jobs**. | A waiting task has neither button, and its **Comes after** row says it comes after an earlier task, with a link only when that task is also theirs. No owner, title or due date editing, no other job actions, no activity list, no **Report** tab. |
| The editor | The task's file, in the task's languages: what their role allows on its strings, including the AI suggestion, which is charged to the workspace as for anyone. The editor's other AI actions are not opened (see Not built). Saves are checked against the project's own QA rules, which are sent with the task's strings. | Opened only from an open task. Text files only for now: the views used for images, video, office files and documents rely on routes that stay closed (see Not built). Any other file, any other language, another branch of the file, "all files" and groups of identical strings (which span files) are refused. The task's file is the one upload record the task was made for, so it is one file on one branch. The file's activity log, a string's activity tab, tag search and undoing a whole operation (a job's or an import's changes) are not opened. |
| Translation memory and glossary | The suggestions and term matches the editor shows for a string of the task. | Lookup only, for the task's languages, from the memories and glossaries linked to the task's project, and only for the source text of a string in the task's file, so it cannot be used to browse. Matches come without links to the entry or the means to change it. No list, no editing. |
| Download | The editor's own download of the task's file; the file as uploaded and its translation in a task language, which the editor uses to show documents. | No new download button on the task's page. |
| **Mark done** | On their own open task. | As for everyone else. |
| Their account | Sign out, theme and language, choosing another workspace they belong to, leaving the workspace. | From the account menu. The settings pages stay closed. |

Inside a task their role decides, exactly as it does in the editor for anyone: saving, commenting, approving and asking for an AI suggestion follow the role's rights there, and the task's step does not change them. (The editor lets a Translator approve a string when saving it, as it does on main; whether a vendor Translator should is an open question.) Source text, tags, design links, string limits, hiding or locking strings, memory entries and screenshots stay closed whatever the role, because those routes are not opened.

Vendor people see the names of the people who wrote comments or earlier versions in their file. They see no other names.

### What stays closed

Everything else. Checked by name in the tests: the dashboard, projects and their files, the job list beyond their own tasks, other people's tasks, the member list and the directory used for mentions, teams, glossaries, translation memories, dictionaries, guidelines, project templates, Reports and time logging, issues, QA, automations and visual workflows, conversations with the assistant, the inbox and notifications, integrations and connections, workspace settings, billing, API keys, activity logs, and the public API, MCP and plugin sign-ins (Figma, Canva, Sanity, Slack).

Vendor people's navigation shows **My jobs** only. Any other page sends them back to it.

### How it is kept closed

Each code base checks "is this person in a vendor team of this workspace" once, where it already looks the person up, and refuses them unless the route was opened on purpose. Every way in goes through that one check: a vendor keeps a real role (an admin's, even), so a path that confirmed the person by itself and then trusted the role would let them in.

- **Web app:** the one function that every signed-in request and page goes through reads it with the membership and refuses vendor people unless the caller says the route is one of theirs. Their routes are one short list in one file. A request is let in only when every route that matches its path and method is on that list (middleware aside), so a closed route that overlaps an open one cannot answer for it. The same holds for pages: a page refuses them unless it opts in. They get a page frame of their own (My jobs and the account menu), because the usual frame loads the inbox, QA reports, the assistant and billing.
- **Go service:** the function that resolves the signed-in person reads it and refuses vendor people, and every service uses it. A second function, which accepts them, is called only by the handlers in the table above. A route added later refuses them without anyone thinking about it.
- **Onboarding:** a workspace where the person is a vendor is not theirs to set up, so its onboarding steps (such as the AI provider key) treat them as having no workspace there. They can still create a workspace of their own.
- **Public API, MCP, agent sign-in and plugins:** the shared check that confirms a person by id, which every token, agent and plugin sign-in goes through, refuses vendor people outright. A token made before a person joined a vendor team stops working while they are in it.
- **Ways in that never read the web session:** the Slack and email assistants do not know vendor people as senders, and a **Human approval** step refuses one as its reviewer, because they have no inbox to answer from.
- **Reports:** closed by the web app's gate and by the shared Go check, like any other route.

Inside an opened route vendor people never go through the team rule. Their access is always "an open task I own".

Two rules in the data keep queries that ask who is on a team (such as who is emailed about an issue, or who appears in an assignee list) from reaching vendor people:

- **Vendor people are in no other team.** Adding someone to a vendor team takes them out of their other teams, and adding a vendor person to another team (the default team included, when an invite names none) is refused.
- **A vendor team has no projects.** It cannot be chosen as a project's or a template's team, it is never picked as the team a new project or sample data goes to, and it cannot take the default team's slug.

**Only someone who may manage a person can put them in a vendor team**, as for changing their role: a localization manager cannot shut an admin out. **The workspace keeps an admin outside vendor teams.** The rule that a workspace always has an admin who has accepted their invitation counts only admins outside vendor teams. Adding the last such admin to a vendor team is refused, as is removing, demoting or the leaving of the last such admin when every other admin is in a vendor team. An admin in no team counts.

### A task's owner need not be on the project's team

This holds for every person, not only vendor people, and fixes the task that shows in **My jobs** but cannot be opened:

- The owner of an open post-edit or proofread task on a file can open its page, the editor for its file and languages, and **Mark done**, whatever team the project is in. Outside their teams they get the reduced task page vendor people have and are limited to that file and those languages, and to what their role allows there. Nothing changes for people working through their teams.
- Such a task, while it is open or waiting, can be given to anyone whose role can work on jobs (the Member role cannot, so it would be stuck): when its owner is changed in the app, where the owner picker now lists them, and through the public API. Both asked for a member of the project's team before, and someone on the project's team can still be given it as before. Any other job, a finished task included, keeps the rule each place had. Creating a job with an owner keeps its rule too (the owner is a workspace member), with only the vendor rule below added, so a read-only member outside the team can still be handed a task at creation that they can open but not finish; that gap is older than this change and is left for a follow-up.
- Vendor people can be given post-edit and proofread tasks on a file. Giving them any other job (a translate task, a task on chosen strings, an AI job) is refused with a message, in the app, the **Assign task** step and both API hosts, because nothing would let them open or finish it. An issue cannot be given to them either.
- API tokens keep the team rule: a token does not open a task through ownership.

### Making a vendor team and adding people

- On **Teams**, an admin or localization manager making a team can mark it as a vendor team. The list shows which teams are vendor teams, and a vendor team's page, its add-member dialog and the dialogs that remove a person or delete the team say what that means.
- An invite's team choice lists vendor teams, so a person can be invited straight into one. The invite form asks for a team only for roles below localization manager; anyone else is added on **Teams** after they join.
- An existing member is added to a vendor team as to any team, and is then taken out of their other teams. Jobs and issues they already own stay theirs and are not reassigned (see Not built). Removing them from the vendor team, or deleting the team, gives them back the workspace their role allows, in no team; the dialogs say so.
- Vendor people count as paid seats, as every member does; that is left as it is.

## Not built

Each is a follow-up, and nothing here prepares for it unless said:

- **Second pull request:** giving a task to a vendor team, and the team's manager (the agency's project manager) seeing all the team's tasks and handing each one to a person in the team. Until then a task is given to a person, and the team's manager is shut out like the rest of the team.
- A vendor team's manager adding or inviting their own people; accepting or declining a task; Reports by vendor and time logging by vendors; a linked workspace of the vendor's own; vendors on translate tasks and on tasks of chosen strings; a history of a vendor's finished tasks; notices by email or in the inbox when a task is given or opens; working on images, video, office files and documents through a task (uploading a translated file, approving a file view, turning document edits into strings); reassigning what a member owns, and disconnecting accounts they connected for automations, when they join a vendor team; the editor's other AI actions (rewriting, guideline checks, finding context in a repository, image and video actions) through a task; turning a team into a vendor team or back; recording joining and leaving a team in the activity log.

## Alternatives considered

- **A Vendor role** (the first design, built in this pull request and replaced after review). A seventh workspace role with no rights, held in WorkOS like the others. It kept the whole gate on one fact every service already reads, and the Go services refused it for free as a role they do not know. But one role cannot say both "outside" and what the person does, so an agency's reviewer and its translator could not differ, and the task's step had to decide approving. Review asked for the agency's own project manager, translators and reviewers, which a team gives. The cost of the team is that access now depends on a fact in our database as well as the role in WorkOS, so each service's gate reads team membership.
- **An existing role (Translator or Reviewer) in no team.** No new idea, but the person still sees members' names and email addresses, dictionaries, project templates and workspace glossaries, and one ordinary action (adding them to a team) opens whole projects.
- **A mark on the membership over an existing role.** Safe only where each check remembers the mark; a route that forgets it, or is added later, is open. The vendor team is such a mark, made safe by reading it at the one gate in each service rather than in each check.
- **A linked workspace for the vendor.** The strongest separation, but nothing is shared between workspaces today.
- **No account, exchanging a file.** Already possible through the public API, and fits an agency working in its own tool. It is not assigning a vendor in the product.

## Before release

The database gains a column on teams in one migration. Nothing is needed in WorkOS.

The Go services are deployed before the web app. The web app is where a vendor team is made; if it went first, vendor people's **My Jobs** and editor would be refused until the Go service that opens the task routes to them was updated, and an older Go service and public API would still honour tokens they made earlier.

## Test plan

This changes the access rules of live features, so an existing test that fails is treated as a possible regression: it is reported and decided on, not edited to pass.

**Automated**

- Each gate: the default refuses vendor people; the opted-in path accepts them. For the web app, a test walks every route the app registers and expects a refusal for vendor people on all but the listed ones, so a new route is covered the day it is added.
- Every opened path, as vendor people: allowed on their own open task; refused on a waiting task (editor, Mark done), a finished task, a task given to someone else, another person's task, another file of the same project, another language of the same file, "all files", and another workspace.
- Rights by role: saving, approving and the AI suggestion as a Reviewer on both steps; the AI suggestion refused for a role without AI actions; Mark done refused for a role that does not work on jobs; each closed action refused.
- Memory and glossary lookup allowed for the task's languages and the text of the task's strings, and refused for other languages and other text; lists and edits refused.
- Ways in that never read the web session: the Slack and email assistants, plugin sign-ins, MCP, the **Human approval** step, tokens and agents.
- Representative closed paths in each service, named in "What stays closed", including the member directory, project templates, dictionaries, Reports, token creation, the public API with an older token, and MCP.
- Data rules: joining a vendor team leaves other teams; a vendor person cannot join another team; a vendor team cannot be a project's team or the default for a new project; the admin rule.
- Owners off the project's team: page, editor, Mark done as each role; assignment accepted in the app, the step and the API; the refusals for vendor people.
- The existing suites in full: the web suite, and the Go checks and tests.

**End to end** (the existing local browser tests, which sign in through a WorkOS stand-in; they are not run in CI): a vendor flow covering sign-in landing on **My jobs**, the navigation, and being sent back from pages that stay closed, beside the existing role flows.

**In the browser, as a person would:** make a vendor team, invite a person into it, sign in as them, **My jobs**, open the task, edit, **Mark done**, and see access end; try each closed page and address by hand. Then, as admin, localization manager, developer, reviewer, translator and member: **My jobs**, a task's page, the editor, **Mark done**, the invite dialog and the owner picker behave as before. The pull request lists what was tried and what was not.
