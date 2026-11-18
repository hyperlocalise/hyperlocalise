# The Vendor role: outside people who see only the tasks they are given

**Status:** Accepted

Ships as one pull request, on top of the two in [A file's human steps in order](2026-11-16-task-steps-in-order-design.md), whose **Mark done** on post-edit tasks it needs.

## Context

A customer wants a file machine translated and then post-edited or proofread by an outside vendor: a freelancer, or a person at an agency. The vendor must see that work and nothing else in the workspace.

Today that is not possible. Every role, down to **Member**, can read the member list with email addresses, every dictionary and project template, workspace-level glossaries, and every project of the teams the person is in. A person in no team still sees most of that. And a task given to someone who is not on the project's team shows in their **My jobs** but cannot be opened, while the public API refuses to give such a person a task at all.

Other platforms handle vendors in three ways: a linked organization of the vendor's own, a restricted user inside the customer's account, or a group with its own manager. On all of them a vendor's person sees assigned work only, and reads the translation memory and glossary inside the editor for that work. A restricted user is the one that fits what this platform has.

## Words used here

- **Task:** a job for a person on one file, for some languages, at one step (post-edit or proofread), with an owner and a due date.
- **Open task:** a task its owner can work on now (status **Waiting for review**). A **waiting** task comes after another job that has not finished. A **finished** task was marked done or cancelled.
- **Team rule:** today's rule for where a person may work: the projects of the teams they are in, or every project for admins and localization managers.
- **Gate:** one place in the code that every request passes through, which refuses a vendor unless the route was opened on purpose.

## Decision

**Vendor is a seventh workspace role with no rights in the workspace.** Everything a vendor can see or do comes from the open tasks they own, and ends when a task is finished or given to someone else. What they may do in the editor comes from the task's step, because the role itself allows nothing.

### What a vendor can see and do

| Where | What | Limits |
|---|---|---|
| **My jobs** | Their open and waiting tasks: title, project name, file, languages, step, status, due date. | Only the **Assigned** list. A finished or reassigned task leaves it. |
| The task's page | The same details, **Open Editor** and **Mark done**. After **Mark done**, or when the task has ended or moved to someone else, they are taken back to **My jobs**. | A waiting task has neither button, and its **Comes after** row says it comes after an earlier task, with a link only when that task is also theirs. No owner, title or due date editing, no other job actions, no activity list, no **Report** tab. |
| The editor | The task's file, in the task's languages: source and target text, saving translations, restoring an earlier version of a string, comments (read and add), a string's history, and screenshots already attached to a string. Saves are checked against the project's own QA rules, which are sent with the task's strings. | Opened only from an open task. Text files only for now: the views used for images, video, office files and documents rely on routes that stay closed (see Not built). Any other file, any other language, another branch of the file, "all files" and groups of identical strings (which span files) are refused. The task's file is the one upload record the task was made for, so it is one file on one branch. The file's activity log, a string's activity tab, tag search and undoing a whole operation (a job's or an import's changes) are not opened. |
| Translation memory and glossary | The suggestions and term matches the editor shows for a string of the task. | Lookup only, for the task's languages, from the memories and glossaries linked to the task's project, and only for the source text of a string in the task's file, so it cannot be used to browse. Matches come without links to the entry or the means to change it. No list, no editing. |
| Download | The editor's own download of the task's file; the file as uploaded and its translation in a task language, which the editor uses to show documents. | No new download button on the task's page. |
| **Mark done** | On their own open task. | As for everyone else. |
| Their account | Sign out, theme and language, choosing another workspace they belong to, leaving the workspace. | From the account menu. The settings pages stay closed. |

By step:

- **Post-edit task:** read, save translations, comment. Approving or rejecting is refused, and so is restoring a string to a version that was approved or rejected. **Approve** is not shown.
- **Proofread task:** the same, plus approve and reject.
- **Never, at either step:** changing source text, tags, design links, string limits, hiding or locking strings, editing a memory entry, uploading or managing screenshots, AI actions (they are charged to the workspace).

A vendor sees the names of the people who wrote comments or earlier versions in their file. They see no other names.

### What stays closed

Everything else. Checked by name in the tests: the dashboard, projects and their files, the job list beyond their own tasks, other people's tasks, the member list and the directory used for mentions, teams, glossaries, translation memories, dictionaries, guidelines, project templates, Reports and time logging, issues, QA, automations and visual workflows, conversations with the assistant, the inbox and notifications, integrations and connections, workspace settings, billing, API keys, activity logs, and the public API, MCP and plugin sign-ins (Figma, Canva, Sanity, Slack).

A vendor's navigation shows **My jobs** only. Any other page sends them back to it.

### How it is kept closed

The platform checks roles in four code bases, and they do not behave alike for a role with no rights:

- **Go service** (job list, task page, editor): refuses any role it does not know before a handler runs. Once it knows the role, dozens of routes that ask only for a signed-in member would open, among them the member directory with email addresses.
- **Web app:** most pages and many routes ask only for a signed-in member, and the navigation is not filtered by role.
- **Public API:** lets every role read, and every role but Member write.
- **Reports:** refuses a role it does not name.

So the role is refused at one gate in each, and opened route by route:

- **Go service:** the function that resolves the signed-in person keeps refusing Vendor. A second function, which accepts Vendor, is called only by the handlers in the table above. A route added later refuses a vendor without anyone thinking about it.
- **Web app:** the one function that every signed-in request and page goes through refuses a vendor unless the caller says the route is one of the vendor's. The vendor's routes are one short list in one file. A request is let in only when every route that matches its path and method is on that list (middleware aside), so a closed route that overlaps a vendor route cannot answer for it. The same holds for pages: a page refuses a vendor unless it opts in. A vendor gets a page frame of their own (My jobs and the account menu), because the usual frame loads the inbox, QA reports, the assistant and billing; it also sends a vendor back from the few pages that load nothing on the server, whose requests are refused anyway.
- **Public API, MCP, agent sign-in and plugins:** refuse the Vendor role outright. A vendor cannot create an API token, and a token made before a person became a vendor stops working while they are one. The same holds for a Canva, Figma or Sanity plugin sign-in, which cannot be made, used or renewed.
- **Ways in that never read the web session:** the Slack and email assistants do not know a vendor as a sender, and a **Human approval** step refuses a vendor as its reviewer, because a vendor has no inbox to answer from.
- **Reports:** unchanged; it already refuses.

Inside an opened route a vendor never goes through the team rule. Their access is always "an open task I own". A vendor is also in no team, ever: an invite as Vendor joins none, a member who is given the role is taken out of their teams (whether the role is given in the app or arrives from WorkOS), and adding a vendor to a team is refused. That is one rule in the data in place of a check in every query that asks who is on a team, such as who is emailed about an issue.

### A task's owner need not be on the project's team

This holds for every role, not only vendors, and fixes the task that shows in **My jobs** but cannot be opened:

- The owner of an open post-edit or proofread task on a file can open its page, the editor for its file and languages, and **Mark done**, whatever team the project is in. Outside their teams they get the same reduced task page a vendor has and are limited to that file and those languages and to the editor actions a vendor has, and never more than their role allows: approving follows their role, not the task's step. Nothing changes for people working through their teams.
- Such a task, while it is open or waiting, can be given to a vendor or to any active member whose role can work on jobs (the Member role cannot, so it would be stuck): when its owner is changed in the app, where the owner picker now lists them, and through the public API. Both asked for a member of the project's team before, and someone on the project's team can still be given it as before. Any other job, a finished task included, keeps the rule each place had. Creating a job with an owner keeps its rule too (the owner is a workspace member), with only the vendor rule below added, so a read-only member outside the team can still be handed a task at creation that they can open but not finish; that gap is older than this change and is left for a follow-up.
- A vendor can be given post-edit and proofread tasks on a file. Giving a vendor any other job (a translate task, a task on chosen strings, an AI job) is refused with a message, in the app, the **Assign task** step and both API hosts, because nothing would let them open or finish it. An issue cannot be given to a vendor either.
- API tokens keep the team rule: a token does not open a task through ownership.

### Inviting and managing

- **Vendor** is in the role list when inviting and when changing a role, for admins and localization managers.
- An invite as Vendor joins no team, and the team choice is not shown for it. Today every invite below localization manager joins the default team.
- A vendor is a member like any other on the **Members** page and can be removed or given another role there. A vendor counts as a paid seat, as every member does; that is left as it is. Changing a member to Vendor takes them out of their teams. Jobs and issues they already own stay theirs and are not reassigned (see Not built).
- **Role permissions** has one line under its table saying what a vendor can reach; a column of empty cells is not added.

## Not built

Each is a follow-up, and nothing here prepares for it: agencies as teams (picking an assignee from a team, a team's name on a task); an agency's manager handing work on; accepting or declining a task; Reports by vendor and time logging by vendors; a linked workspace of the vendor's own; vendors on translate tasks and on tasks of chosen strings; a history of a vendor's finished tasks; notices by email or in the inbox when a task is given or opens; working on images, video, office files and documents through a task (uploading a translated file, approving a file view, turning document edits into strings); reassigning what a member owns, and disconnecting accounts they connected for automations, when they are changed to Vendor.

## Alternatives considered

- **An existing role (Translator or Reviewer) in no team.** No new role, but the person still sees members' names and email addresses, dictionaries, project templates and workspace glossaries, and one ordinary action (adding them to a team) opens whole projects.
- **A mark on the membership over an existing role.** Safe only where each check remembers the mark; a route that forgets it, or is added later, is open. It would also live only in our database while roles live in WorkOS.
- **A new role with no gate, relying on each route's own check.** This was the first plan. Reading the code showed the web app does not refuse a role it does not know, so each of several dozen routes and most pages would need its own check, and a missed one is a leak. The Go services do refuse an unknown role, through the membership check they share, and Vendor is kept out of their list of known roles for that reason.
- **A linked workspace for the vendor.** The strongest separation, but nothing is shared between workspaces today.
- **No account, exchanging a file.** Already possible through the public API, and fits an agency working in its own tool. It is not assigning a vendor in the product.

## Before release

The Vendor role has to exist in WorkOS before anyone is invited with it: the setup command that creates the other six creates it too, and must be run for each environment. Until then an invite as Vendor fails and nothing is changed. The database gains the role value in one migration.

The Go services are deployed before the web app. The web app is where a person is made a vendor; if it went first, that person's **My Jobs** and editor would be refused until the Go service that opens the task routes to vendors was updated, and a Go service older than the shared membership check would still honour a token they made earlier.

## Test plan

This changes the access rules of live features, so an existing test that fails is treated as a possible regression: it is reported and decided on, not edited to pass.

**Automated**

- Each gate: the default refuses a vendor; the opted-in path accepts one. For the web app, a test walks every route the app registers and expects a refusal for a vendor on all but the listed ones, so a new route is covered the day it is added.
- Every opened path, as a vendor: allowed on their own open task; refused on a waiting task (editor, Mark done), a finished task, a task given to someone else, another person's task, another file of the same project, another language of the same file, "all files", and another workspace.
- Rights by step: saving on both; approving and rejecting refused on post-edit and allowed on proofread; each "never" action refused.
- Memory and glossary lookup allowed for the task's languages and the text of the task's strings, and refused for other languages and other text; lists and edits refused.
- Ways in that never read the web session: the Slack and email assistants, plugin sign-ins, MCP, the **Human approval** step, and the role as it arrives from WorkOS.
- Representative closed paths in each service, named in "What stays closed", including the member directory, project templates, dictionaries, Reports, token creation, the public API with an older token, and MCP.
- Owners off the project's team: page, editor, Mark done as each role; assignment accepted in the app, the step and the API; the refusals for vendors.
- Invites: Vendor joins no team; other roles still join as before; who may assign the role.
- The existing suites in full: the web suite, and the Go checks and tests.

**End to end** (the existing local browser tests, which sign in through a WorkOS stand-in; they are not run in CI): a new vendor flow covering sign-in landing on **My jobs**, the navigation, and being sent back from pages that stay closed, beside the existing role flows.

**In the browser, as a person would:** invite a vendor, sign in as them, **My jobs**, open the task, edit, **Mark done**, and see access end; try each closed page and address by hand. Then, as admin, localization manager, developer, reviewer, translator and member: **My jobs**, a task's page, the editor, **Mark done**, the invite dialog and the owner picker behave as before. The pull request lists what was tried and what was not.
