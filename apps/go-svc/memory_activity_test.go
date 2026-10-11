package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMemoryActivityEvents(t *testing.T) {
	t.Run("create emits translation_memory_created", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher

		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories"), `{"name":"Product TM"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "translation_memory_created", events[0].EventType)
		require.Equal(t, "translation_memory", events[0].TargetKind)
		require.Equal(t, scope.UserID, events[0].ActorUserID)
		require.Equal(t, scope.OrganizationID, events[0].OrganizationID)
		require.Equal(t, "Product TM", events[0].Payload["name"])
		require.Equal(t, "native", events[0].Payload["source"])
		require.Equal(t, events[0].TargetID, events[0].Payload["resourceId"])
	})

	t.Run("member create is silent", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "member")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher

		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories"), `{"name":"Product TM"}`)
		require.Equal(t, 403, rec.Code)
		require.Empty(t, publisher.recorded())
	})

	t.Run("delete emits translation_memory_deleted", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher
		id := scope.MustMemory(t, "", "Product TM")

		rec := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id), "")
		require.Equal(t, 204, rec.Code, rec.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "translation_memory_deleted", events[0].EventType)
		require.Equal(t, id, events[0].TargetID)
		require.Equal(t, "Product TM", events[0].Payload["name"])
	})

	t.Run("attach and detach emit project events", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher
		id := scope.MustMemory(t, "", "Product TM")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")

		attach := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/projects"), `{"projectId":"`+projectID+`"}`)
		require.Equal(t, 200, attach.Code, attach.Body.String())

		detach := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id+"/projects/"+projectID), "")
		require.Equal(t, 204, detach.Code, detach.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 2)
		require.Equal(t, "translation_memory_project_attached", events[0].EventType)
		require.Equal(t, "project", events[0].TargetKind)
		require.Equal(t, projectID, events[0].TargetID)
		require.Equal(t, id, events[0].Payload["resourceId"])
		require.Equal(t, "translation_memory_project_detached", events[1].EventType)
		require.Equal(t, projectID, events[1].TargetID)
	})

	t.Run("export queue emits translation_memory_exported", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher
		api.interchange = &recordingMemoryInterchangePublisher{}
		id := scope.MustMemory(t, "", "Product TM")

		rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=tmx"), "")
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "translation_memory_exported", events[0].EventType)
		require.Equal(t, id, events[0].TargetID)
	})

	t.Run("denied mutations emit translation_memory_action_rejected", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher
		id := scope.MustMemory(t, "", "Product TM")
		_, err := scope.Pool.Exec(t.Context(), `update memories set source='external_tms' where id=$1`, id)
		require.NoError(t, err)

		rec := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id), "")
		require.Equal(t, 403, rec.Code, rec.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "translation_memory_action_rejected", events[0].EventType)
		require.Equal(t, "delete", events[0].Payload["action"])
		require.Equal(t, "read_only", events[0].Payload["reason"])
		require.Equal(t, id, events[0].TargetID)
	})

	t.Run("archived delete emits rejected", func(t *testing.T) {
		api, scope := memoryTestAPI(t, "admin")
		publisher := &recordingActivityLogPublisher{}
		api.activityLog = publisher
		id := scope.MustMemory(t, "", "Product TM")
		_, err := scope.Pool.Exec(t.Context(), `update memories set status='archived' where id=$1`, id)
		require.NoError(t, err)

		rec := memoryRequest(api, scope, "DELETE", scope.OrgPath("/translation-memories/"+id), "")
		require.Equal(t, 403, rec.Code, rec.Body.String())

		events := publisher.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "translation_memory_action_rejected", events[0].EventType)
		require.Equal(t, "archived", events[0].Payload["reason"])
	})
}

func TestMemoryListSourceAndProjectCount(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	nativeID := scope.MustMemory(t, "", "Native TM")
	externalID := scope.MustMemory(t, "", "External TM")
	_, err := scope.Pool.Exec(t.Context(), `update memories set source='external_tms' where id=$1`, externalID)
	require.NoError(t, err)
	projectID := scope.MustProject(t, scope.ProjectID, "Project")
	mustAttachMemory(t, scope, projectID, nativeID)

	native := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories")+"?source=native", "")
	require.Equal(t, 200, native.Code, native.Body.String())
	var nativeBody struct {
		Memories []struct {
			ID           string `json:"id"`
			Source       string `json:"source"`
			ProjectCount int    `json:"projectCount"`
		} `json:"memories"`
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(native.Body.Bytes(), &nativeBody))
	require.Equal(t, 1, nativeBody.Total)
	require.Equal(t, nativeID, nativeBody.Memories[0].ID)
	require.Equal(t, "native", nativeBody.Memories[0].Source)
	require.Equal(t, 1, nativeBody.Memories[0].ProjectCount)

	external := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories")+"?source=external_tms", "")
	require.Equal(t, 200, external.Code, external.Body.String())
	var externalBody struct {
		Memories []struct {
			ID           string `json:"id"`
			ProjectCount int    `json:"projectCount"`
		} `json:"memories"`
		Total int `json:"total"`
	}
	require.NoError(t, json.Unmarshal(external.Body.Bytes(), &externalBody))
	require.Equal(t, 1, externalBody.Total)
	require.Equal(t, externalID, externalBody.Memories[0].ID)
	require.Equal(t, 0, externalBody.Memories[0].ProjectCount)
}
