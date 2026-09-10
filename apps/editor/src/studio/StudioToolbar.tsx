import type {FC,ReactNode} from "react";
import {useRemotionEnvironment} from "remotion";

/**
 * Generic wrapper retained from the validated editor boundary. The legacy
 * implementation patched private Remotion Studio DOM nodes; that brittle host
 * assumption is intentionally removed during the unified-repository adapt.
 * Editor controls live in StudioEditor and rendering remains unaffected.
 */
export const StudioToolbarProvider:FC<{children:ReactNode;compositionId:string}>=({children})=>{const {isStudio}=useRemotionEnvironment();void isStudio;return <>{children}</>;};
