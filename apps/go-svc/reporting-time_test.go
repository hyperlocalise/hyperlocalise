package main

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const reportingTestWeek = "from=2026-06-08&to=2026-06-14"

func seedReportingTime(t *testing.T) (*testenv.Scope, string, map[string]string) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	colleague := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `insert into users (id, workos_user_id, email) values ($1, $2, $3)`, colleague, "user_"+colleague, colleague+"@example.com")
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = scope.Pool.Exec(t.Context(), `delete from users where id = $1`, colleague) })
	jobs := map[string]string{
		"release": mustReportingTask(t, scope, "job_release", scope.ProjectID, "translation", "running", "Release strings", ""),
		// A post-edit task from a visual workflow, and a proofread task made in the app.
		"help":  mustReportingTask(t, scope, "job_help", scope.ProjectID, "proofread", "running", "Help articles", "edit"),
		"legal": mustReportingTask(t, scope, "job_legal", scope.ProjectID, "proofread", "running", "Legal pages", ""),
		"sync":  mustReportingTask(t, scope, "job_sync", scope.ProjectID, "sync", "running", "Nightly sync", ""),
	}
	entry := func(jobID, contributorID string, minutes int, day, step, locale string, voided bool) {
		_, err := scope.Pool.Exec(t.Context(), `
            insert into reporting_time_entries (organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, voided)
            values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)`,
			scope.OrganizationID, scope.ProjectID, jobID, contributorID, step, locale, day, minutes, voided)
		require.NoError(t, err)
	}
	entry(jobs["release"], scope.UserID, 60, "2026-06-08", "translation", "fr-FR", false)
	entry(jobs["release"], colleague, 30, "2026-06-14", "translation", "fr-FR", false)
	entry(jobs["release"], scope.UserID, 45, "2026-06-09", "review", "fr-FR", false)
	entry(jobs["help"], scope.UserID, 20, "2026-06-10", "translation", "de-DE", false)
	entry(jobs["help"], scope.UserID, 500, "2026-06-10", "translation", "fr-FR", true)
	entry(jobs["help"], scope.UserID, 15, "2026-06-01", "translation", "fr-FR", false)
	entry(jobs["legal"], colleague, 10, "2026-06-12", "review", "fr-FR", false)
	entry(jobs["sync"], scope.UserID, 5, "2026-06-12", "translation", "fr-FR", false)
	return scope, colleague, jobs
}

func TestReportingTimeTotalsLoggedTimeByTaskStepAndLanguage(t *testing.T) {
	scope, _, jobs := seedReportingTime(t)
	time := reportingReadJSON(t, scope, "admin", "/reports/time?"+reportingTestWeek)["time"].(map[string]any)
	logged := time["logged"].(map[string]any)
	rows := logged["rows"].([]any)
	require.Len(t, rows, 5)
	require.Equal(t, map[string]any{
		"jobId": jobs["release"], "jobTitle": "Release strings", "projectId": scope.ProjectID, "taskStep": "translate",
		"step": "translation", "targetLocale": "fr-FR", "minutes": float64(90), "people": float64(2),
	}, rows[0])
	require.Equal(t, "review", rows[1].(map[string]any)["step"])
	require.Equal(t, float64(45), rows[1].(map[string]any)["minutes"])
	require.Equal(t, "post_edit", rows[2].(map[string]any)["taskStep"])
	require.Equal(t, "de-DE", rows[2].(map[string]any)["targetLocale"])
	require.Equal(t, "proofread", rows[3].(map[string]any)["taskStep"])
	require.Equal(t, "other", rows[4].(map[string]any)["taskStep"])
	require.Equal(t, float64(5), logged["rowCount"])
	require.Equal(t, float64(1), logged["page"])
	require.Equal(t, float64(50), logged["pageSize"])
	require.Equal(t, map[string]any{"minutes": float64(170), "people": float64(2), "tasks": float64(4)}, logged["totals"])
	require.Equal(t, float64(15), logged["previousMinutes"])
	require.NotNil(t, time["automated"])

	german := reportingReadJSON(t, scope, "admin", "/reports/time?"+reportingTestWeek+"&targetLocale=de-DE")["time"].(map[string]any)
	require.Equal(t, map[string]any{"minutes": float64(20), "people": float64(1), "tasks": float64(1)}, german["logged"].(map[string]any)["totals"])

	// By what each task is for: the review-step entry on the translate task is translate work.
	steps := reportingReadJSON(t, scope, "admin", "/reports/step-times?"+reportingTestWeek)["stepTimes"].(map[string]any)
	require.Equal(t, []any{
		map[string]any{"taskStep": "translate", "minutes": float64(135), "people": float64(2)},
		map[string]any{"taskStep": "post_edit", "minutes": float64(20), "people": float64(1)},
		map[string]any{"taskStep": "proofread", "minutes": float64(10), "people": float64(1)},
		map[string]any{"taskStep": "other", "minutes": float64(5), "people": float64(1)},
	}, steps["logged"])

	lines := reportingReadCSV(t, scope, "admin", "/reports/time?"+reportingTestWeek+"&format=csv")
	require.Equal(t, `"jobTitle","jobId","taskStep","step","targetLocale","minutes","people"`, lines[0])
	require.Equal(t, fmt.Sprintf(`"Release strings","%s","translate","translation","fr-FR","90","2"`, jobs["release"]), lines[1])
	require.Len(t, lines, 6)
}

func TestReportingTimeShowsOtherRolesOnlyTheirOwnTime(t *testing.T) {
	scope, _, _ := seedReportingTime(t)
	for _, role := range []string{"translator", "member"} {
		time := reportingReadJSON(t, scope, role, "/reports/time?"+reportingTestWeek)["time"].(map[string]any)
		// Their own entries only (60 + 45 + 20 + 5), and no automated time: that is workspace activity.
		require.Equal(t, float64(130), time["logged"].(map[string]any)["totals"].(map[string]any)["minutes"], role)
		require.Nil(t, time["automated"], role)
		status, body := reportingSend(t, scope, role, http.MethodGet, "/reports/step-times", "")
		require.Equal(t, http.StatusForbidden, status, role)
		require.Equal(t, "report_costs_forbidden", body["error"], role)
	}
	status, body := reportingSend(t, scope, "admin", http.MethodGet, "/reports/time?page=0", "")
	require.Equal(t, http.StatusBadRequest, status)
	require.Equal(t, "invalid_report_query", body["error"])
}

func TestReportingStepTimesMeasureAutomatedWorkThatFinishedInThePeriod(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	scope.MustTeam(t, "default", "Default", "member")
	ctx := t.Context()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := scope.Pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	workflow := func(projectID *string) string {
		id := uuid.NewString()
		exec(`insert into visual_workflows (id, organization_id, project_id, name) values ($1, $2, $3, 'Publish')`, id, scope.OrganizationID, projectID)
		return id
	}
	run := func(workflowID, mode string) string {
		id := uuid.NewString()
		exec(`insert into visual_workflow_runs (id, organization_id, visual_workflow_id, trigger_source, mode) values ($1, $2, $3, 'manual', $4)`, id, scope.OrganizationID, workflowID, mode)
		return id
	}
	node := func(runID, nodeType string, seconds int, day string, started bool) {
		var startedAt *string
		if started {
			s := day + "T10:00:00Z"
			startedAt = &s
		}
		exec(`insert into visual_workflow_node_runs (organization_id, run_id, node_id, node_type, status, started_at, finished_at)
            values ($1, $2, $3, $4, 'succeeded', $5::timestamptz, ($6::timestamptz + make_interval(secs => $7)))`,
			scope.OrganizationID, runID, fmt.Sprintf("%s-%d", nodeType, seconds), nodeType, startedAt, day+"T10:00:00Z", seconds)
	}
	inProject := workflow(&scope.ProjectID)
	workspaceWide := workflow(nil)
	live, mock, other := run(inProject, "live"), run(inProject, "mock"), run(workspaceWide, "live")
	node(live, "action.http", 2, "2026-06-10", true)
	node(live, "action.http", 3, "2026-06-10", true)
	node(live, "action.notify_slack", 1, "2026-06-10", true)
	node(live, "action.http", 60, "2026-06-01", true)
	node(mock, "action.http", 100, "2026-06-10", true)
	node(other, "action.http", 7, "2026-06-10", true)
	// A trigger has no run time.
	node(live, "trigger.manual", 0, "2026-06-10", false)

	job := mustReportingTask(t, scope, "job_run", scope.ProjectID, "translation", "succeeded", "", "")
	staged := mustReportingTask(t, scope, "job_staged", scope.ProjectID, "translation", "succeeded", "", "")
	image := mustReportingTask(t, scope, "job_image", scope.ProjectID, "translation", "succeeded", "", "")
	strings := mustReportingTask(t, scope, "job_strings", scope.ProjectID, "translation", "failed", "", "")
	event := func(jobID, runID, kind, at string, locale *string) {
		exec(`insert into job_events (job_id, organization_id, workflow_run_id, type, locale, created_at) values ($1, $2, $3, $4, $5, $6::timestamptz)`,
			jobID, scope.OrganizationID, runID, kind, locale, at)
	}
	fr, de, es := "fr-FR", "de-DE", "es-ES"
	// A first run that failed before the period, then a retry that took ten minutes and recorded
	// no stage boundaries but one.
	event(job, "run-1", "job_started", "2026-06-01T09:00:00Z", nil)
	event(job, "run-1", "job_failed", "2026-06-01T09:05:00Z", nil)
	event(job, "run-2", "job_started", "2026-06-09T23:55:00Z", nil)
	event(job, "run-2", "strings_extracted", "2026-06-09T23:58:00Z", nil)
	event(job, "run-2", "job_succeeded", "2026-06-10T00:05:00Z", nil)
	// A run with every stage: 60 s preparing, 20 s reusing the memory, two languages translating
	// side by side with German done first, then the files written and both languages' finished
	// events stored together. Spanish had no memory hits, so no reuse event of its own.
	event(staged, "run-3", "job_started", "2026-06-10T10:00:00Z", nil)
	event(staged, "run-3", "context_ready", "2026-06-10T10:00:30Z", nil)
	event(staged, "run-3", "strings_extracted", "2026-06-10T10:01:00Z", nil)
	event(staged, "run-3", "translations_reused", "2026-06-10T10:01:10Z", &fr)
	event(staged, "run-3", "translations_reused", "2026-06-10T10:01:20Z", &de)
	event(staged, "run-3", "locale_progress", "2026-06-10T10:02:00Z", &fr)
	event(staged, "run-3", "locale_progress", "2026-06-10T10:03:00Z", &de)
	event(staged, "run-3", "locale_progress", "2026-06-10T10:03:30Z", &es)
	event(staged, "run-3", "locale_progress", "2026-06-10T10:04:00Z", &fr)
	event(staged, "run-3", "locale_completed", "2026-06-10T10:04:20Z", &de)
	event(staged, "run-3", "locale_completed", "2026-06-10T10:04:20Z", &fr)
	event(staged, "run-3", "job_succeeded", "2026-06-10T10:04:30Z", nil)
	// An image run records no stages: two minutes, all "other".
	event(image, "run-4", "job_started", "2026-06-10T11:00:00Z", nil)
	event(image, "run-4", "locale_completed", "2026-06-10T11:01:00Z", &fr)
	event(image, "run-4", "job_succeeded", "2026-06-10T11:02:00Z", nil)
	// A string job's failed run records the failure alone, so it is not a run.
	event(strings, "run-5", "job_failed", "2026-06-10T12:00:00Z", nil)
	exec(`update jobs set completed_at = '2026-06-10T00:05:00Z' where id = $1`, job)
	exec(`update jobs set completed_at = '2026-06-10T10:04:30Z' where id = $1`, staged)
	exec(`update jobs set completed_at = '2026-06-10T11:02:00Z' where id = $1`, image)

	stages := func(values ...float64) []any {
		result := []any{}
		for i, stage := range reportingTaskRunStages {
			result = append(result, map[string]any{"stage": stage, "milliseconds": values[i]})
		}
		return result
	}
	// The workspace's own workflow counts for a billing role; test runs with mock data never do.
	automated := reportingReadJSON(t, scope, "admin", "/reports/step-times?"+reportingTestWeek)["stepTimes"].(map[string]any)["automated"].(map[string]any)
	require.Equal(t, []any{
		map[string]any{"nodeType": "action.http", "milliseconds": float64(12_000), "runs": float64(3)},
		map[string]any{"nodeType": "action.notify_slack", "milliseconds": float64(1000), "runs": float64(1)},
	}, automated["workflowSteps"])
	// The ten-minute run has only an extraction boundary: 3 min preparing, 7 min finishing. The
	// image run has none: all "other".
	require.Equal(t, map[string]any{
		"milliseconds": float64(990_000), "runs": float64(3),
		"stages": stages(240_000, 20_000, 160_000, 450_000, 120_000),
	}, automated["taskRuns"])

	// Within one project, the workspace-wide workflow is left out.
	inProjectOnly := reportingReadJSON(t, scope, "admin", "/reports/step-times?"+reportingTestWeek+"&projectId="+scope.ProjectID)["stepTimes"].(map[string]any)["automated"].(map[string]any)
	require.Equal(t, float64(5000), inProjectOnly["workflowSteps"].([]any)[0].(map[string]any)["milliseconds"])

	// With a language chosen: only runs that reached it; memory reuse and translating for it
	// alone (German's last progress at 10:03:00), the rest of the run whole.
	german := reportingReadJSON(t, scope, "admin", "/reports/step-times?"+reportingTestWeek+"&targetLocale=de-DE")["stepTimes"].(map[string]any)["automated"].(map[string]any)
	require.Equal(t, map[string]any{
		"milliseconds": float64(270_000), "runs": float64(1),
		"stages": stages(60_000, 20_000, 100_000, 30_000, 0),
	}, german["taskRuns"])
	// A language with no reuse of its own starts translating at the run's last reuse.
	spanish := reportingReadJSON(t, scope, "admin", "/reports/step-times?"+reportingTestWeek+"&targetLocale=es-ES")["stepTimes"].(map[string]any)["automated"].(map[string]any)
	require.Equal(t, stages(60_000, 0, 130_000, 30_000, 0), spanish["taskRuns"].(map[string]any)["stages"])

	lines := reportingReadCSV(t, scope, "admin", "/reports/step-times?"+reportingTestWeek+"&format=csv")
	require.Equal(t, []string{
		`"kind","name","minutes","people","runs"`,
		`"task_runs","translation","17","","3"`,
		`"task_run_stage","preparing","4","","3"`,
		`"task_run_stage","reusing_memory","0","","3"`,
		`"task_run_stage","translating","3","","3"`,
		`"task_run_stage","finishing","8","","3"`,
		`"task_run_stage","other","2","","3"`,
		`"workflow_step","action.http","0","","3"`,
		`"workflow_step","action.notify_slack","0","","1"`,
	}, lines)
}

func TestReportingStepTimesCSVWritesLoggedRunsAndSteps(t *testing.T) {
	times := reportingStepTimes{
		Logged: []reportingStepTime{{TaskStep: "translate", Minutes: 30, People: 1}},
		Automated: reportingAutomatedTime{
			WorkflowSteps: []reportingWorkflowStepTime{{NodeType: "action.http", Milliseconds: 90_000, Runs: 3}},
			TaskRuns: reportingTaskRuns{Milliseconds: 600_000, Runs: 2, Stages: []reportingStageTime{
				{"preparing", 60_000}, {"reusing_memory", 0}, {"translating", 480_000}, {"finishing", 60_000}, {"other", 0},
			}},
		},
	}
	require.Equal(t, []string{
		`"kind","name","minutes","people","runs"`,
		`"logged","translate","30","1",""`,
		`"task_runs","translation","10","","2"`,
		`"task_run_stage","preparing","1","","2"`,
		`"task_run_stage","reusing_memory","0","","2"`,
		`"task_run_stage","translating","8","","2"`,
		`"task_run_stage","finishing","1","","2"`,
		`"task_run_stage","other","0","","2"`,
		`"workflow_step","action.http","2","","3"`,
	}, reportingCSVLines(t, reportingStepTimesCSV(times)))
	// No task runs, no rows for them.
	times.Logged = nil
	times.Automated.TaskRuns.Runs = 0
	require.Equal(t, []string{`"kind","name","minutes","people","runs"`, `"workflow_step","action.http","2","","3"`}, reportingCSVLines(t, reportingStepTimesCSV(times)))

	title := "Release"
	logged := reportingLoggedTime{Rows: []reportingLoggedTimeRow{{JobID: "job_1", JobTitle: &title, ProjectID: "project_1", TaskStep: "post_edit", Step: "review", TargetLocale: "fr-FR", Minutes: 90, People: 2}}}
	require.Equal(t, []string{
		`"jobTitle","jobId","taskStep","step","targetLocale","minutes","people"`,
		`"Release","job_1","post_edit","review","fr-FR","90","2"`,
	}, reportingCSVLines(t, reportingLoggedTimeCSV(logged)))
}
