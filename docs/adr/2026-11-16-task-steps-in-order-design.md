# A file's human steps in order: post-edit, then proofread

**Status:** Accepted

Ships as two pull requests. This record is written before the first and is updated as each lands:

1. **A post-edit task can be finished.** **Mark done** works on post-edit tasks, and the **Job changed** trigger can tell a post-edit task from a proofread one.
2. **A task can wait for another.** Each step's task is made at the start, and a later one opens when the one before it is finished.

## Context

A customer moving from Phrase TMS asked for a workflow that machine translates a file, has it post-edited or revised by a named person with a deadline for each step, and is driven by their own scripts through the API. Phrase TMS, Smartling, memoQ, Smartcat, Lokalise, Crowdin, Transifex and XTM all offer this in some form; they were compared part by part, and each part was fitted to what the platform already has rather than copied from one of them.

What exists today:

- A **task** is one file, its languages and one step (translate, post-edit or proofread), with an owner and a due date. A visual workflow's **Assign task** step makes one.
- **Machine translate** fills a file, and a task labelled post-edit already has its own rates in Reports.
- **Mark done** finishes a proofread task. Nothing finishes a post-edit task: it stays open for good, although the API guide says such tasks finish on their own.
- The **Job changed** trigger starts a workflow when a job changes, but it cannot tell a post-edit task from a proofread one, because both are stored as the same kind of job.
- Through the public API, a script can make a task for a person only on a chosen set of strings. A job on a file is always work for the AI.
- Nothing joins one task to the next. A reviser's task either exists from the start, open beside the post-editor's, or has to be made by something that notices the post-editing has finished.

## What is built now, and what is not

Built: the two parts above, for people who are workspace members.

Not built here:

- **Outside vendors.** Who a task can be given to stays exactly as it is today: a member of the workspace (and, where the public API already asks for it, one who can open the project). Whether an agency or a freelancer is a new role, a team, or a linked workspace is a later and separate decision. Nothing here depends on it, and whichever way it goes adds to who can own a task without changing how tasks wait for one another.
- Accepting or declining a task, sending work back a step, a due date counted from when a task opens, and a project setting that chooses the steps.

## Decision

**A step is a task, and which steps run is simply which tasks are made.** No post-edit task means no post-editing. There is no new setting for it.

### Part 1: a post-edit task can be finished

- **Mark done** finishes a post-edit task as it does a proofread task, in the app and through the API's complete call, with the same rule for who may do it. A fixed fee set on the task is charged once, as for a proofread task. Translate tasks for people are left as they are.
- The **Job changed** trigger gets a **Task step** choice: Post-edit, Proofread, or both. Left empty it behaves as before. With a step chosen, only tasks for people at that step start a run; a proofread task made in the app, or one made of chosen strings, counts as Proofread.
- The trigger passes on more about a task for people, so later steps need not look it up: its step, its file, its languages, its owner and its due date. They are read from the job when the run starts. The owner is passed as an id, as everything else the trigger passes is an id or a status, and a value the job does not have is left out.
- The two ship together. Once a post-edit task can be finished, a workflow that acts on finished proofread tasks would otherwise also start on a finished post-edit task.

### Part 2: a task can wait for another

- **A task can name the task it comes after.** It is made straight away, with its owner and due date, but it is **waiting**: it is in the job list and in its owner's jobs, it cannot be marked done, and its page says which task it waits for. A manager can change its owner or due date, or cancel it, at any time.
- **It opens when the earlier task is marked done or cancelled.** A cancelled step is treated as a skipped one, so a chain does not stop silently. Opening is a job change like any other: webhooks send it, and a **Job changed** workflow can act on it. A failed job (only AI jobs fail) leaves the later task waiting until it is retried or cancelled.
- **Only post-edit and proofread tasks can wait.** A waiting task is stored with the status the platform already has for work that has not started (`queued`), plus one new link to the earlier job. For these two kinds of task nothing in the platform starts AI work from that status; for a translate task **Retry** would, so a translate task cannot wait.
- **What it comes after is fixed when the task is made**, and must be a job in the same project. To change it, cancel the task and make another.
- **Reports.** A waiting task counts as open work from the start, so its cost shows in what is still to come. Work saved in the editor goes to the task that was open at the time: a task that comes after another takes saves only from the moment the earlier one ended.
- **Public API.** Creating a file job takes `step` (`post_edit` or `proofread`) to make a task for a person instead of AI work, and `after` (a job id) to make it wait. With the existing owner, due date, bulk update, complete call and webhooks, a script can set up and follow a whole file without a visual workflow. Reading a job returns what it comes after.
- **Visual workflows.** **Assign task** takes an optional task to come after, so one run can machine translate, pick people, and make the post-edit and proofread tasks together.

## Alternatives considered

- **A finished task starts a workflow that makes the next task.** This needs no link between tasks. Not chosen: the later step cannot be seen, assigned or given a deadline ahead of time; its cost is missing from Reports until it exists; a paused or failed workflow leaves a file between steps with nothing to show for it; and a script using only the API cannot do it.
- **Steps as rows of one job**, as in Phrase TMS and memoQ. Closest to what the customer uses today, but a job here has one status, one owner and one due date, and everything from the job list to Reports reads it that way.
- **Keep the later task open and only refuse Mark done until the earlier one is finished.** No status change, but the two tasks look the same in every list, nothing announces that the later one can start, and Reports would give the post-editor's work to the reviser.
- **A new "waiting" status.** Clearer to read, but every list, filter, count and API client that knows the six statuses would have to learn a seventh.
- **Let translate tasks be finished and wait too.** Not asked for, and the waiting state is not safe for them without changing **Retry**.

## Risks

- **Jobs, the public API and Reports are in use by customers.** Part 1 changes which tasks can be finished and what a workflow hears. A workflow that acts on finished proofread tasks should set **Task step** to Proofread; without it, it also starts on finished post-edit tasks.
- **Open jobs limit.** A workspace may hold 50 open jobs, and tasks on files count. Making every step's task at the start doubles how fast a workspace reaches it.
- **Opening is not instant.** Job changes are processed about once a minute, so a waiting task opens up to a minute after the earlier one is finished.
- **No notice of its own.** The owner of a task that opens is not sent a message by the platform; assigning a task sends none today either. They see it in their jobs, and a webhook or a workflow can tell them.
- **A status label.** A waiting task shows as Queued in lists, the word used for AI work that has not started. Its page says what it waits for.

## What was checked

- Every place that starts AI work on a job takes only jobs of the translation kind (the AI run's claim, **Retry**, and handing an existing job to the AI), and no scheduled job looks for queued jobs. A test holds a queued task for a person against those paths.
- A test showed that today a waiting proofread task would take the post-editor's saves in Reports, which is why a later task takes saves only from when the earlier one ended.
- A test showed that marking a post-edit task done charges its fixed fee once, also when it is marked done twice.
