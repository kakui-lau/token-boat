package pricingruntime

import (
	"crypto/sha256"
	"encoding/binary"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type RolloutPolicy struct {
	Percent       int
	Groups        map[string]struct{}
	UserIds       map[int]struct{}
	ShadowEnabled bool
}

func CurrentRolloutPolicy() RolloutPolicy {
	common.OptionMapRWMutex.RLock()
	percentText := common.OptionMap["PricingV2RolloutPercent"]
	groupsText := common.OptionMap["PricingV2RolloutGroups"]
	userIdsText := common.OptionMap["PricingV2RolloutUserIds"]
	shadowText := common.OptionMap["PricingV2ShadowEnabled"]
	common.OptionMapRWMutex.RUnlock()

	percent, err := strconv.Atoi(strings.TrimSpace(percentText))
	if err != nil || percent < 0 || percent > 100 {
		percent = 0
	}
	policy := RolloutPolicy{
		Percent:       percent,
		Groups:        make(map[string]struct{}),
		UserIds:       make(map[int]struct{}),
		ShadowEnabled: strings.EqualFold(strings.TrimSpace(shadowText), "true"),
	}
	for _, group := range strings.Split(groupsText, ",") {
		if group = strings.TrimSpace(group); group != "" {
			policy.Groups[group] = struct{}{}
		}
	}
	for _, userIdText := range strings.Split(userIdsText, ",") {
		userId, err := strconv.Atoi(strings.TrimSpace(userIdText))
		if err == nil && userId > 0 {
			policy.UserIds[userId] = struct{}{}
		}
	}
	return policy
}

func ShouldUseV2(userId int, group string, requestId string, modelName string) bool {
	policy := CurrentRolloutPolicy()
	if _, allowed := policy.UserIds[userId]; allowed {
		return true
	}
	if len(policy.Groups) > 0 {
		if _, allowed := policy.Groups[group]; !allowed {
			return false
		}
	}
	if policy.Percent <= 0 {
		return false
	}
	if policy.Percent >= 100 {
		return true
	}
	key := requestId + "\x00" + strconv.Itoa(userId) + "\x00" + group + "\x00" + modelName
	sum := sha256.Sum256([]byte(key))
	bucket := int(binary.BigEndian.Uint64(sum[:8]) % 100)
	return bucket < policy.Percent
}
