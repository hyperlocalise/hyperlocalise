package runsvc

import (
	"cmp"
	"fmt"
	"path/filepath"
	"slices"
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

type selectionTaskIndexKey struct {
	Group        string
	Bucket       string
	TargetLocale string
	SourcePath   string
}

type stringSet map[string]struct{}

func (s stringSet) add(value string) {
	s[value] = struct{}{}
}

func (s stringSet) sortedValues() []string {
	if len(s) == 0 {
		return nil
	}
	// BOLT OPTIMIZATION: Assign elements by index to avoid append checks, and skip slices.Sort for single-element sets.
	values := make([]string, len(s))
	i := 0
	for value := range s {
		values[i] = value
		i++
	}
	if len(values) > 1 {
		slices.Sort(values)
	}
	return values
}

type selectionGroupAgg struct {
	taskCount     int
	buckets       stringSet
	targetLocales stringSet
	files         stringSet
}

type selectionBucketAgg struct {
	taskCount     int
	groups        stringSet
	targetLocales stringSet
	files         stringSet
}

type selectionTargetLocaleAgg struct {
	taskCount int
	groups    stringSet
	buckets   stringSet
	files     stringSet
}

type selectionFileAgg struct {
	path          string
	directory     string
	taskCount     int
	groups        stringSet
	buckets       stringSet
	targetLocales stringSet
}

func BuildSelectionCatalog(configPath string) (SelectionCatalog, error) {
	return New().BuildSelectionCatalog(configPath)
}

func (s *Service) BuildSelectionCatalog(configPath string) (SelectionCatalog, error) {
	cfg, err := s.loadConfig(configPath)
	if err != nil {
		return SelectionCatalog{}, fmt.Errorf("load config: %w", err)
	}

	planned, _, err := s.planTasks(cfg, "", "", nil, nil, nil, nil)
	if err != nil {
		return SelectionCatalog{}, err
	}

	return buildSelectionCatalogFromTasks(configPath, planned), nil
}

func buildSelectionCatalogFromTasks(configPath string, planned []Task) SelectionCatalog {
	catalog := SelectionCatalog{
		ConfigPath: configPath,
		TotalTasks: len(planned),
	}

	// BOLT OPTIMIZATION: Pre-allocate aggregator maps with capacity hints to reduce re-allocations and rehashing.
	groupAgg := make(map[string]*selectionGroupAgg, 8)
	bucketAgg := make(map[string]*selectionBucketAgg, 8)
	targetAgg := make(map[string]*selectionTargetLocaleAgg, 8)
	fileAgg := make(map[string]*selectionFileAgg, 64)
	taskAgg := make(map[selectionTaskIndexKey]*SelectionTaskIndex, len(planned)/64)

	for _, task := range planned {
		groupEntry := groupAgg[task.GroupName]
		if groupEntry == nil {
			// BOLT OPTIMIZATION: Initialize stringSets with sensible low-capacity bounds to prevent resizing of small maps.
			groupEntry = &selectionGroupAgg{
				buckets:       make(stringSet, 4),
				targetLocales: make(stringSet, 4),
				files:         make(stringSet, 16),
			}
			groupAgg[task.GroupName] = groupEntry
		}
		groupEntry.taskCount++
		groupEntry.buckets.add(task.BucketName)
		groupEntry.targetLocales.add(task.TargetLocale)
		groupEntry.files.add(task.SourcePath)

		bucketEntry := bucketAgg[task.BucketName]
		if bucketEntry == nil {
			// BOLT OPTIMIZATION: Initialize stringSets with sensible low-capacity bounds to prevent resizing of small maps.
			bucketEntry = &selectionBucketAgg{
				groups:        make(stringSet, 4),
				targetLocales: make(stringSet, 4),
				files:         make(stringSet, 16),
			}
			bucketAgg[task.BucketName] = bucketEntry
		}
		bucketEntry.taskCount++
		bucketEntry.groups.add(task.GroupName)
		bucketEntry.targetLocales.add(task.TargetLocale)
		bucketEntry.files.add(task.SourcePath)

		targetEntry := targetAgg[task.TargetLocale]
		if targetEntry == nil {
			// BOLT OPTIMIZATION: Initialize stringSets with sensible low-capacity bounds to prevent resizing of small maps.
			targetEntry = &selectionTargetLocaleAgg{
				groups:  make(stringSet, 4),
				buckets: make(stringSet, 4),
				files:   make(stringSet, 16),
			}
			targetAgg[task.TargetLocale] = targetEntry
		}
		targetEntry.taskCount++
		targetEntry.groups.add(task.GroupName)
		targetEntry.buckets.add(task.BucketName)
		targetEntry.files.add(task.SourcePath)

		fileEntry := fileAgg[task.SourcePath]
		if fileEntry == nil {
			// BOLT OPTIMIZATION: Initialize stringSets with sensible low-capacity bounds to prevent resizing of small maps.
			fileEntry = &selectionFileAgg{
				path:          task.SourcePath,
				directory:     filepath.Dir(task.SourcePath),
				groups:        make(stringSet, 4),
				buckets:       make(stringSet, 4),
				targetLocales: make(stringSet, 4),
			}
			fileAgg[task.SourcePath] = fileEntry
		}
		fileEntry.taskCount++
		fileEntry.groups.add(task.GroupName)
		fileEntry.buckets.add(task.BucketName)
		fileEntry.targetLocales.add(task.TargetLocale)

		taskKey := selectionTaskIndexKey{
			Group:        task.GroupName,
			Bucket:       task.BucketName,
			TargetLocale: task.TargetLocale,
			SourcePath:   task.SourcePath,
		}
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
	for name, item := range groupAgg {
		group := SelectionGroup{
			Name:          name,
			Buckets:       item.buckets.sortedValues(),
			TargetLocales: item.targetLocales.sortedValues(),
			Files:         item.files.sortedValues(),
			TaskCount:     item.taskCount,
		}
		group.BucketCount = len(group.Buckets)
		group.TargetCount = len(group.TargetLocales)
		group.FileCount = len(group.Files)
		catalog.Groups = append(catalog.Groups, group)
	}
	// BOLT OPTIMIZATION: Replace reflection-based sort.Slice with type-safe slices.SortFunc.
	slices.SortFunc(catalog.Groups, func(a, b SelectionGroup) int {
		return cmp.Compare(a.Name, b.Name)
	})

	catalog.Buckets = make([]SelectionBucket, 0, len(bucketAgg))
	for name, item := range bucketAgg {
		bucket := SelectionBucket{
			Name:          name,
			Groups:        item.groups.sortedValues(),
			TargetLocales: item.targetLocales.sortedValues(),
			Files:         item.files.sortedValues(),
			TaskCount:     item.taskCount,
		}
		bucket.GroupCount = len(bucket.Groups)
		bucket.TargetCount = len(bucket.TargetLocales)
		bucket.FileCount = len(bucket.Files)
		catalog.Buckets = append(catalog.Buckets, bucket)
	}
	// BOLT OPTIMIZATION: Replace reflection-based sort.Slice with type-safe slices.SortFunc.
	slices.SortFunc(catalog.Buckets, func(a, b SelectionBucket) int {
		return cmp.Compare(a.Name, b.Name)
	})

	catalog.TargetLocales = make([]SelectionTargetLocale, 0, len(targetAgg))
	for locale, item := range targetAgg {
		target := SelectionTargetLocale{
			Locale:    locale,
			Groups:    item.groups.sortedValues(),
			Buckets:   item.buckets.sortedValues(),
			Files:     item.files.sortedValues(),
			TaskCount: item.taskCount,
		}
		target.GroupCount = len(target.Groups)
		target.BucketCount = len(target.Buckets)
		target.FileCount = len(target.Files)
		catalog.TargetLocales = append(catalog.TargetLocales, target)
	}
	// BOLT OPTIMIZATION: Replace reflection-based sort.Slice with type-safe slices.SortFunc.
	slices.SortFunc(catalog.TargetLocales, func(a, b SelectionTargetLocale) int {
		return cmp.Compare(a.Locale, b.Locale)
	})

	catalog.Files = make([]SelectionFile, 0, len(fileAgg))
	for _, item := range fileAgg {
		file := SelectionFile{
			Path:          item.path,
			Directory:     item.directory,
			Groups:        item.groups.sortedValues(),
			Buckets:       item.buckets.sortedValues(),
			TargetLocales: item.targetLocales.sortedValues(),
			TaskCount:     item.taskCount,
		}
		file.GroupCount = len(file.Groups)
		file.BucketCount = len(file.Buckets)
		file.TargetCount = len(file.TargetLocales)
		catalog.Files = append(catalog.Files, file)
	}
	// BOLT OPTIMIZATION: Replace reflection-based sort.Slice with type-safe slices.SortFunc.
	slices.SortFunc(catalog.Files, func(a, b SelectionFile) int {
		return cmp.Compare(a.Path, b.Path)
	})

	catalog.TaskIndex = make([]SelectionTaskIndex, 0, len(taskAgg))
	for _, item := range taskAgg {
		catalog.TaskIndex = append(catalog.TaskIndex, *item)
	}
	// BOLT OPTIMIZATION: Replace reflection-based sort.Slice with type-safe slices.SortFunc.
	slices.SortFunc(catalog.TaskIndex, func(a, b SelectionTaskIndex) int {
		if a.Group != b.Group {
			return cmp.Compare(a.Group, b.Group)
		}
		if a.Bucket != b.Bucket {
			return cmp.Compare(a.Bucket, b.Bucket)
		}
		if a.TargetLocale != b.TargetLocale {
			return cmp.Compare(a.TargetLocale, b.TargetLocale)
		}
		return cmp.Compare(a.SourcePath, b.SourcePath)
	})

	return catalog
}
