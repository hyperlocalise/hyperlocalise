package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDictionaryCreateDeleteImportAndAttachPublishActivity(t *testing.T) {
	api, scope := dictionaryTestAPI(t, "admin")
	publisher := &recordingActivityLogPublisher{}
	api.activityLog = publisher
	projectID := scope.MustProject(t, scope.ProjectID, "Project")

	created := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries"), `{"name":"Brand names"}`)
	require.Equal(t, 201, created.Code, created.Body.String())
	var body struct {
		Dictionary dictionaryRecord `json:"dictionary"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &body))

	imported := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+body.Dictionary.ID+"/words/import"), `{"locale":"en-US","content":"AuthKit\nHyperlocalise"}`)
	require.Equal(t, 200, imported.Code, imported.Body.String())

	attached := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+body.Dictionary.ID+"/projects"), `{"projectId":"`+projectID+`"}`)
	require.Equal(t, 200, attached.Code, attached.Body.String())

	again := dictionaryRequest(api, scope, "POST", scope.OrgPath("/projects/"+projectID+"/dictionaries"), `{"dictionaryId":"`+body.Dictionary.ID+`"}`)
	require.Equal(t, 200, again.Code, again.Body.String())

	deleted := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/dictionaries/"+body.Dictionary.ID), "")
	require.Equal(t, 204, deleted.Code)

	events := publisher.recorded()
	require.Len(t, events, 4)
	require.Equal(t, "dictionary_created", events[0].EventType)
	require.Equal(t, "dictionary", events[0].TargetKind)
	require.Equal(t, body.Dictionary.ID, events[0].TargetID)
	require.Equal(t, "Brand names", events[0].Payload["name"])
	require.Equal(t, body.Dictionary.ID, events[0].Payload["resourceId"])

	require.Equal(t, "dictionary_imported", events[1].EventType)
	require.Equal(t, body.Dictionary.ID, events[1].TargetID)
	require.Equal(t, 2, events[1].Payload["itemCount"])
	require.Equal(t, "en-US", events[1].Payload["locale"])

	require.Equal(t, "dictionary_project_attached", events[2].EventType)
	require.Equal(t, "project", events[2].TargetKind)
	require.Equal(t, projectID, events[2].TargetID)
	require.Equal(t, projectID, events[2].Payload["projectId"])
	require.Equal(t, body.Dictionary.ID, events[2].Payload["resourceId"])

	require.Equal(t, "dictionary_deleted", events[3].EventType)
	require.Equal(t, body.Dictionary.ID, events[3].TargetID)
	require.Equal(t, "Brand names", events[3].Payload["name"])
}

func TestDictionaryWordCreateDoesNotPublishImportActivity(t *testing.T) {
	api, scope := dictionaryTestAPI(t, "admin")
	publisher := &recordingActivityLogPublisher{}
	api.activityLog = publisher
	id := scope.MustDictionary(t, "", "Brand names")

	rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+id+"/words"), `{"locale":"en-US","word":"AuthKit"}`)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.Empty(t, publisher.recorded())
}
