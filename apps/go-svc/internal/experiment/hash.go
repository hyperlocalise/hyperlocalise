package experiment

import (
	"fmt"
	"math"
)

const bucketCount = 10000

func murmurhash3(key string, seed uint32) uint32 {
	remainder := len(key) & 3
	bytes := len(key) - remainder
	h1 := seed
	const c1 = 0xcc9e2d51
	const c2 = 0x1b873593
	i := 0

	for i < bytes {
		k1 := uint32(key[i]) |
			uint32(key[i+1])<<8 |
			uint32(key[i+2])<<16 |
			uint32(key[i+3])<<24
		i += 4

		k1 *= c1
		k1 = (k1 << 15) | (k1 >> 17)
		k1 *= c2

		h1 ^= k1
		h1 = (h1 << 13) | (h1 >> 19)
		h1 = h1*5 + 0xe6546b64
	}

	var k1 uint32
	switch remainder {
	case 3:
		k1 ^= uint32(key[i+2]) << 16
		fallthrough
	case 2:
		k1 ^= uint32(key[i+1]) << 8
		fallthrough
	case 1:
		k1 ^= uint32(key[i])
		k1 *= c1
		k1 = (k1 << 15) | (k1 >> 17)
		k1 *= c2
		h1 ^= k1
	}

	h1 ^= uint32(len(key))
	h1 ^= h1 >> 16
	h1 *= 0x85ebca6b
	h1 ^= h1 >> 13
	h1 *= 0xc2b2ae35
	h1 ^= h1 >> 16
	return h1
}

func calculateBucket(experimentID, targetingKey string, seed int32) int {
	key := fmt.Sprintf("experimentId:%s::targetingKey:%s", experimentID, targetingKey)
	hash := murmurhash3(key, uint32(seed))
	return int(hash % uint32(bucketCount))
}

func calculateAllocationRanges(experimentRolloutPercentage int, variantRolloutPercentages []int) []*[2]int {
	normalized := min(max(experimentRolloutPercentage, 0), 10000)
	allocatedBuckets := int(math.Floor(float64(normalized) / 10000 * float64(bucketCount)))
	ranges := make([]*[2]int, 0, len(variantRolloutPercentages))
	start := 0

	for i, variantPercentage := range variantRolloutPercentages {
		if variantPercentage == 0 {
			ranges = append(ranges, nil)
			continue
		}
		normalizedVariant := min(max(variantPercentage, 0), 10000)
		variantBuckets := int(math.Floor(float64(normalizedVariant) / 10000 * float64(allocatedBuckets)))
		remaining := max(allocatedBuckets-start, 0)
		adjusted := variantBuckets
		if i == len(variantRolloutPercentages)-1 {
			adjusted = remaining
		} else if adjusted > remaining {
			adjusted = remaining
		}
		end := start + adjusted - 1
		if end >= start {
			ranges = append(ranges, &[2]int{start, end})
			start = end + 1
		} else {
			ranges = append(ranges, nil)
		}
	}
	return ranges
}
