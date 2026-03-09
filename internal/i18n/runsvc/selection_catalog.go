package runsvc

import (
	"fmt"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

type SelectionCatalog struct {
	ConfigPath    string                  `json:"configPath,omitempty"`
	TotalTasks    int                     `json:"totalTasks"`
	TotalFiles    int                     `json:"totalFiles"`
	Groups        []SelectionGroup        `json:"groups,omitempty"`
	Buckets       []SelectionBucket       `json:"buckets,omitempty"`
	TargetLocales []SelectionTargetLocale `json:"targetLocales,omitempty"`
	Files         []SelectionFile         `json:"files,omitempty"`
	TaskIndex     []SelectionTaskIndex    `json:"-"`
}

type SelectionGroup struct {
	Name          string   `json:"name"`
	Buckets       []string `json:"buckets,omitempty"`
	TargetLocales []string `json:"targetLocales,omitempty"`
	Files         []string `json:"files,omitempty"`
	BucketCount   int      `json:"bucketCount"`
	TargetCount   int      `json:"targetCount"`
	FileCount     int      `json:"fileCount"`
	TaskCount     int      `json:"taskCount"`
}

type SelectionBucket struct {
	Name          string   `json:"name"`
	Groups        []string `json:"groups,omitempty"`
	TargetLocales []string `json:"targetLocales,omitempty"`
	Files         []string `json:"files,omitempty"`
	GroupCount    int      `json:"groupCount"`
	TargetCount   int      `json:"targetCount"`
	FileCount     int      `json:"fileCount"`
	TaskCount     int      `json:"taskCount"`
}

type SelectionTargetLocale struct {
	Locale      string   `json:"locale"`
	Groups      []string `json:"groups,omitempty"`
	Buckets     []string `json:"buckets,omitempty"`
	Files       []string `json:"files,omitempty"`
	GroupCount  int      `json:"groupCount"`
	BucketCount int      `json:"bucketCount"`
	FileCount   int      `json:"fileCount"`
	TaskCount   int      `json:"taskCount"`
}

type SelectionFile struct {
	Path          string   `json:"path"`
	Directory     string   `json:"directory,omitempty"`
	Groups        []string `json:"groups,omitempty"`
	Buckets       []string `json:"buckets,omitempty"`
	TargetLocales []string `json:"targetLocales,omitempty"`
	GroupCount    int      `json:"groupCount"`
	BucketCount   int      `json:"bucketCount"`
	TargetCount   int      `json:"targetCount"`
	TaskCount     int      `json:"taskCount"`
}

type SelectionTaskIndex struct {
	Group        string `json:"group"`
	Bucket       string `json:"bucket"`
	TargetLocale string `json:"targetLocale"`
	SourcePath   string `json:"sourcePath"`
	TaskCount    int    `json:"taskCount"`
}

func BuildSelectionCatalog(configPath string) (SelectionCatalog, error) {
	return New().BuildSelectionCatalog(configPath)
}

func (s *Service) BuildSelectionCatalog(configPath string) (SelectionCatalog, error) {
	cfg, err := s.loadConfig(configPath)
	if err != nil {
		return SelectionCatalog{}, fmt.Errorf("load config: %w", err)
	}

	planned, err := s.planTasks(cfg, "", "", nil, nil)
	if err != nil {
		return SelectionCatalog{}, err
	}

	catalog := SelectionCatalog{
		ConfigPath: configPath,
		TotalTasks: len(planned),
	}

	groupAgg := map[string]*SelectionGroup{}
	bucketAgg := map[string]*SelectionBucket{}
	targetAgg := map[string]*SelectionTargetLocale{}
	fileAgg := map[string]*SelectionFile{}
	taskAgg := map[string]*SelectionTaskIndex{}

	for _, task := range planned {
		groupEntry := groupAgg[task.GroupName]
		if groupEntry == nil {
			groupEntry = &SelectionGroup{Name: task.GroupName}
			groupAgg[task.GroupName] = groupEntry
		}
		groupEntry.TaskCount++

		bucketEntry := bucketAgg[task.BucketName]
		if bucketEntry == nil {
			bucketEntry = &SelectionBucket{Name: task.BucketName}
			bucketAgg[task.BucketName] = bucketEntry
		}
		bucketEntry.TaskCount++

		targetEntry := targetAgg[task.TargetLocale]
		if targetEntry == nil {
			targetEntry = &SelectionTargetLocale{Locale: task.TargetLocale}
			targetAgg[task.TargetLocale] = targetEntry
		}
		targetEntry.TaskCount++

		fileEntry := fileAgg[task.SourcePath]
		if fileEntry == nil {
			fileEntry = &SelectionFile{
				Path:      task.SourcePath,
				Directory: filepath.Dir(task.SourcePath),
			}
			fileAgg[task.SourcePath] = fileEntry
		}
		fileEntry.TaskCount++

		addUniqueString(&groupEntry.Buckets, task.BucketName)
		addUniqueString(&groupEntry.TargetLocales, task.TargetLocale)
		addUniqueString(&groupEntry.Files, task.SourcePath)

		addUniqueString(&bucketEntry.Groups, task.GroupName)
		addUniqueString(&bucketEntry.TargetLocales, task.TargetLocale)
		addUniqueString(&bucketEntry.Files, task.SourcePath)

		addUniqueString(&targetEntry.Groups, task.GroupName)
		addUniqueString(&targetEntry.Buckets, task.BucketName)
		addUniqueString(&targetEntry.Files, task.SourcePath)

		addUniqueString(&fileEntry.Groups, task.GroupName)
		addUniqueString(&fileEntry.Buckets, task.BucketName)
		addUniqueString(&fileEntry.TargetLocales, task.TargetLocale)

		taskKey := strings.Join([]string{task.GroupName, task.BucketName, task.TargetLocale, task.SourcePath}, "\x00")
		if taskIndex := taskAgg[taskKey]; taskIndex != nil {
			taskIndex.TaskCount++
		} else {
			taskAgg[taskKey] = &SelectionTaskIndex{
				Group:        task.GroupName,
				Bucket:       task.BucketName,
				TargetLocale: task.TargetLocale,
				SourcePath:   task.SourcePath,
				TaskCount:    1,
			}
		}
	}

	catalog.TotalFiles = len(fileAgg)
	catalog.Groups = make([]SelectionGroup, 0, len(groupAgg))
	for _, item := range groupAgg {
		finalizeGroup(item)
		catalog.Groups = append(catalog.Groups, *item)
	}
	sort.Slice(catalog.Groups, func(i, j int) bool { return catalog.Groups[i].Name < catalog.Groups[j].Name })

	catalog.Buckets = make([]SelectionBucket, 0, len(bucketAgg))
	for _, item := range bucketAgg {
		finalizeBucket(item)
		catalog.Buckets = append(catalog.Buckets, *item)
	}
	sort.Slice(catalog.Buckets, func(i, j int) bool { return catalog.Buckets[i].Name < catalog.Buckets[j].Name })

	catalog.TargetLocales = make([]SelectionTargetLocale, 0, len(targetAgg))
	for _, item := range targetAgg {
		finalizeTargetLocale(item)
		catalog.TargetLocales = append(catalog.TargetLocales, *item)
	}
	sort.Slice(catalog.TargetLocales, func(i, j int) bool { return catalog.TargetLocales[i].Locale < catalog.TargetLocales[j].Locale })

	catalog.Files = make([]SelectionFile, 0, len(fileAgg))
	for _, item := range fileAgg {
		finalizeFile(item)
		catalog.Files = append(catalog.Files, *item)
	}
	sort.Slice(catalog.Files, func(i, j int) bool { return catalog.Files[i].Path < catalog.Files[j].Path })

	catalog.TaskIndex = make([]SelectionTaskIndex, 0, len(taskAgg))
	for _, item := range taskAgg {
		catalog.TaskIndex = append(catalog.TaskIndex, *item)
	}
	sort.Slice(catalog.TaskIndex, func(i, j int) bool {
		left := catalog.TaskIndex[i]
		right := catalog.TaskIndex[j]
		return strings.Join([]string{left.Group, left.Bucket, left.TargetLocale, left.SourcePath}, "\x00") <
			strings.Join([]string{right.Group, right.Bucket, right.TargetLocale, right.SourcePath}, "\x00")
	})

	return catalog, nil
}

func addUniqueString(values *[]string, value string) {
	if slices.Contains(*values, value) {
		return
	}
	*values = append(*values, value)
}

func finalizeGroup(item *SelectionGroup) {
	slices.Sort(item.Buckets)
	slices.Sort(item.TargetLocales)
	slices.Sort(item.Files)
	item.BucketCount = len(item.Buckets)
	item.TargetCount = len(item.TargetLocales)
	item.FileCount = len(item.Files)
}

func finalizeBucket(item *SelectionBucket) {
	slices.Sort(item.Groups)
	slices.Sort(item.TargetLocales)
	slices.Sort(item.Files)
	item.GroupCount = len(item.Groups)
	item.TargetCount = len(item.TargetLocales)
	item.FileCount = len(item.Files)
}

func finalizeTargetLocale(item *SelectionTargetLocale) {
	slices.Sort(item.Groups)
	slices.Sort(item.Buckets)
	slices.Sort(item.Files)
	item.GroupCount = len(item.Groups)
	item.BucketCount = len(item.Buckets)
	item.FileCount = len(item.Files)
}

func finalizeFile(item *SelectionFile) {
	slices.Sort(item.Groups)
	slices.Sort(item.Buckets)
	slices.Sort(item.TargetLocales)
	item.GroupCount = len(item.Groups)
	item.BucketCount = len(item.Buckets)
	item.TargetCount = len(item.TargetLocales)
}
