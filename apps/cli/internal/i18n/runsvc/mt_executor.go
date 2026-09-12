package runsvc

import (
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

// mtBatchSize is a provider-neutral run-service bound.
// Provider-specific batching remains inside internal/mt.
const mtBatchSize = 50

type mtGroupKey struct {
	profileName  string
	sourceLocale string
	targetLocale string
}

type mtTaskGroup struct {
	key   mtGroupKey
	tasks []Task
}

func partitionMTTasks(tasks []Task) (llmTasks []Task, mtTasks []Task) {
	llmTasks = make([]Task, 0, len(tasks))
	mtTasks = make([]Task, 0)
	for _, task := range tasks {
		if task.TranslationType == config.TranslationTypeMT {
			mtTasks = append(mtTasks, task)
			continue
		}
		llmTasks = append(llmTasks, task)
	}
	return llmTasks, mtTasks
}

func groupMTTasksByProfile(tasks []Task) []mtTaskGroup {
	groups := make([]mtTaskGroup, 0)
	index := make(map[mtGroupKey]int, len(tasks))
	for _, task := range tasks {
		key := mtGroupKey{
			profileName:  task.ProfileName,
			sourceLocale: task.SourceLocale,
			targetLocale: task.TargetLocale,
		}
		i, ok := index[key]
		if !ok {
			i = len(groups)
			index[key] = i
			groups = append(groups, mtTaskGroup{key: key})
		}
		groups[i].tasks = append(groups[i].tasks, task)
	}
	return groups
}

func splitMTBatches(tasks []Task, batchSize int) [][]Task {
	if len(tasks) == 0 {
		return nil
	}
	if batchSize <= 0 {
		batchSize = len(tasks)
	}
	batches := make([][]Task, 0, (len(tasks)+batchSize-1)/batchSize)
	for start := 0; start < len(tasks); start += batchSize {
		end := start + batchSize
		if end > len(tasks) {
			end = len(tasks)
		}
		batches = append(batches, tasks[start:end])
	}
	return batches
}
