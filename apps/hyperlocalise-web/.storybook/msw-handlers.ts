import { contentEditorDocumentMswHandlers } from "../src/components/content-editor/file-view/content-editor-document-msw-handlers";
import { contentEditorOfficeMswHandlers } from "../src/components/content-editor/file-view/content-editor-office-msw-handlers";

export const mswHandlers = [...contentEditorDocumentMswHandlers, ...contentEditorOfficeMswHandlers];
