package reporting

import (
	"context"
	"encoding/json"
	"math/big"
)

const (
	WordCountPageSize = reportingWordCountPageSize
	TaskAnalysisStale = reportingTaskAnalysisStale
	AiPageSize        = reportingAiPageSize
	AiChildRows       = reportingAiChildRows
)

var TaskRunStages = reportingTaskRunStages

var (
	UnitOptions = reportingUnitOptions
	StepOptions = reportingStepOptions
	MatchBucket = reportingMatchBucket
)

type (
	RateCard           = reportingRateCard
	RateLine           = reportingRateLine
	RateRow            = reportingRateRow
	CostEstimate       = reportingCostEstimate
	CostEstimateRow    = reportingCostEstimateRow
	CostEstimateTotals = reportingCostEstimateTotals
	WordCounts         = reportingWordCounts
	WordCountRow       = reportingWordCountRow
	StepTimes          = reportingStepTimes
	StepTime           = reportingStepTime
	AutomatedTime      = reportingAutomatedTime
	WorkflowStepTime   = reportingWorkflowStepTime
	TaskRuns           = reportingTaskRuns
	StageTime          = reportingStageTime
	LoggedTime         = reportingLoggedTime
	LoggedTimeRow      = reportingLoggedTimeRow
	CSVWriter          = reportingCSVWriter
	TaskWords          = reportingTaskWords
	TaskWordRow        = reportingTaskWordRow
)

func SamePercentages(left json.RawMessage, right map[string]int) bool {
	return reportingSamePercentages(left, right)
}

func LineKey(sourceLocale, targetLocale, step string) string {
	return reportingLineKey(sourceLocale, targetLocale, step)
}

func LiveRateRowsSQL(organizationParam string) string {
	return reportingLiveRateRowsSQL(organizationParam)
}

func BudgetStatus(budget, spent, forecast *big.Int) string {
	return reportingBudgetStatus(budget, spent, forecast)
}

func ResolveRate(ctx context.Context, db DB, organizationID, projectID, jobID, sourceLocale, targetLocale, step string) (*RateRow, error) {
	return resolveReportingRate(ctx, db, organizationID, projectID, jobID, sourceLocale, targetLocale, step)
}

func WordCountsCSV(counts WordCounts) CSV { return reportingWordCountsCSV(counts) }

func StepTimesCSV(times StepTimes) CSV { return reportingStepTimesCSV(times) }

func LoggedTimeCSV(logged LoggedTime) CSV { return reportingLoggedTimeCSV(logged) }

// QueryPricedUnits runs the estimate's unit query. Tests use it to prove an unvalidated unit panics.
func ProjectIDs(ctx context.Context, db DB, actor Actor) ([]string, error) {
	return reportingProjectIDs(ctx, db, actor)
}

func QueryTaskWords(ctx context.Context, db DB, organizationID, jobID, unit string) (TaskWords, error) {
	return queryReportingTaskWords(ctx, db, organizationID, jobID, unit)
}

func AiAreaSQL(source, agentRunKind string) string {
	return reportingAiAreaSQL(source, agentRunKind)
}

func AiChannelSQL(source, viaApiKey string) string {
	return reportingAiChannelSQL(source, viaApiKey)
}

func AttributedUsageSQL(organizationParam, where string) string {
	return reportingAttributedUsageSQL(organizationParam, where)
}

func ListRateCards(ctx context.Context, db DB, organizationID string) ([]RateCard, error) {
	return listReportingRateCards(ctx, db, organizationID)
}

func CompareNames(a, b string) int {
	return compareReportingNames(a, b)
}

func USDUnits(value string) (*big.Int, error) {
	return usdUnits(value)
}

func USDString(value *big.Int) string {
	return usdString(value)
}

func WordCost(rate string, words, payablePercent int) (*big.Int, error) {
	return wordCost(rate, words, payablePercent)
}

func LockedPricingSteps(ctx context.Context, db DB, organizationID, jobID, status string) ([]string, error) {
	return queryReportingLockedPricingSteps(ctx, db, organizationID, jobID, status)
}

func QueryPricedUnits(ctx context.Context, db DB, organizationID string, projectIDs []string, step, unit, measure string) error {
	_, err := queryReportingPricedUnits(ctx, db, reportingPricingInput{
		organizationID: organizationID, projectIDs: projectIDs, step: step, unit: unit, measure: measure,
	})
	return err
}
