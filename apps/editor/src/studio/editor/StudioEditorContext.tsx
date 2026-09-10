import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {Dispatch, FC, ReactNode} from "react";
import {useRemotionEnvironment} from "remotion";
import {editorActions} from "./editorActions";
import type {EditorAction} from "./editorActions";
import {createEditorState} from "./editorReducer";
import {editorHistoryReducer} from "./editorHistoryReducer";
import type {EditProject, EditorState} from "./editorTypes";
import {
  assertCompatibleEditorProject,
  loadPersistedEditorProject,
  savePersistedEditorProject,
} from "./persistence/editorPersistenceApi";

export type EditorPersistenceStatus =
  | "idle"
  | "loading"
  | "saving"
  | "error";

type EditorPersistenceState = {
  status: EditorPersistenceStatus;
  hydrated: boolean;
  lastSavedAt: string | null;
  savedPath: string | null;
  error: string | null;
};

type StudioEditorContextValue = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  persistence: EditorPersistenceState;
  saveProject: () => Promise<boolean>;
  reloadProject: () => Promise<boolean>;
  canUndo: boolean;
  canRedo: boolean;
};

const StudioEditorContext =
  createContext<StudioEditorContextValue | null>(null);

const AUTO_SAVE_DELAY_MS = 600;

export const StudioEditorProvider: FC<{
  children: ReactNode;
  initialProject?: EditProject;
}> = ({children, initialProject}) => {
  const {isStudio, isReadOnlyStudio} = useRemotionEnvironment();
  const [state, dispatch] = useReducer(
    editorHistoryReducer,
    initialProject,
    createEditorState,
  );
  const initialProjectRef = useRef(initialProject ?? state.project);
  const latestProjectRef = useRef(state.project);
  const [persistence, setPersistence] =
    useState<EditorPersistenceState>({
      status: "idle",
      hydrated: !isStudio || isReadOnlyStudio,
      lastSavedAt: null,
      savedPath: null,
      error: null,
    });

  useEffect(() => {
    latestProjectRef.current = state.project;
  }, [state.project]);

  useEffect(() => {
    if (!isStudio || isReadOnlyStudio) {
      setPersistence((current) => ({
        ...current,
        status: "idle",
        hydrated: true,
      }));
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      setPersistence((current) => ({
        ...current,
        status: "loading",
        hydrated: false,
        error: null,
      }));
      try {
        const loaded = await loadPersistedEditorProject(
          initialProjectRef.current.project.id,
        );
        if (cancelled) {
          return;
        }

        if (loaded) {
          assertCompatibleEditorProject(initialProjectRef.current, loaded);
          dispatch(editorActions.loadProject(loaded));
        }

        setPersistence((current) => ({
          ...current,
          status: "idle",
          hydrated: true,
          error: null,
        }));
      } catch (caught) {
        if (cancelled) {
          return;
        }
        setPersistence((current) => ({
          ...current,
          status: "error",
          hydrated: true,
          error:
            caught instanceof Error ? caught.message : String(caught),
        }));
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [dispatch, isReadOnlyStudio, isStudio]);

  useEffect(() => {
    if (!isStudio || isReadOnlyStudio || !state.dirty) {
      return;
    }

    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [isReadOnlyStudio, isStudio, state.dirty]);

  const persistProject = useCallback(async (project: EditProject) => {
    if (!isStudio || isReadOnlyStudio) {
      return false;
    }

    setPersistence((current) => ({
      ...current,
      status: "saving",
      error: null,
    }));
    try {
      const result = await savePersistedEditorProject(project);
      if (latestProjectRef.current === project) {
        dispatch(editorActions.markSaved());
      }
      setPersistence((current) => ({
        ...current,
        status: "idle",
        hydrated: true,
        lastSavedAt: result.savedAt,
        savedPath: result.path,
        error: null,
      }));
      return true;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : String(caught);
      setPersistence((current) => ({
        ...current,
        status: "error",
        hydrated: true,
        error: message,
      }));
      return false;
    }
  }, [dispatch, isReadOnlyStudio, isStudio]);

  const saveProject = useCallback(
    () => persistProject(latestProjectRef.current),
    [persistProject],
  );

  useEffect(() => {
    if (
      !isStudio ||
      isReadOnlyStudio ||
      !persistence.hydrated ||
      persistence.status !== "idle" ||
      !state.dirty
    ) {
      return;
    }

    const project = state.project;
    const timeout = window.setTimeout(() => {
      void persistProject(project);
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [
    isReadOnlyStudio,
    isStudio,
    persistence.hydrated,
    persistence.status,
    persistProject,
    state.dirty,
    state.project,
  ]);

  const reloadProject = useCallback(async () => {
    if (!isStudio || isReadOnlyStudio) {
      return false;
    }

    setPersistence((current) => ({
      ...current,
      status: "loading",
      error: null,
    }));
    try {
      const loaded = await loadPersistedEditorProject(
        initialProjectRef.current.project.id,
      );
      if (!loaded) {
        setPersistence((current) => ({
          ...current,
          status: "idle",
          hydrated: true,
          error: "저장된 edit_project.json이 없습니다.",
        }));
        return false;
      }

      assertCompatibleEditorProject(initialProjectRef.current, loaded);
      dispatch(editorActions.loadProject(loaded));
      setPersistence((current) => ({
        ...current,
        status: "idle",
        hydrated: true,
        error: null,
      }));
      return true;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : String(caught);
      setPersistence((current) => ({
        ...current,
        status: "error",
        hydrated: true,
        error: message,
      }));
      return false;
    }
  }, [isReadOnlyStudio, isStudio]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      persistence,
      saveProject,
      reloadProject,
      canUndo:
        state.history.past.length > 0 ||
        state.history.transactionBase !== null,
      canRedo: state.history.future.length > 0,
    }),
    [persistence, reloadProject, saveProject, state],
  );

  return (
    <StudioEditorContext.Provider value={value}>
      {children}
    </StudioEditorContext.Provider>
  );
};

export const useStudioEditor = (): StudioEditorContextValue => {
  const value = useContext(StudioEditorContext);
  if (!value) {
    throw new Error(
      "useStudioEditor must be used inside StudioEditorProvider",
    );
  }
  return value;
};
