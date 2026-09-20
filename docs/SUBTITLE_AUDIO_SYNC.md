# Final-audio subtitle synchronization

`Auto Sync T1` is a review-only recovery tool for subtitle timing that drifted
from the final narration. It analyzes the final A1 TTS file with local
`faster-whisper`; it does not change the narration, video clips, or project DB.

## One-time setup per PC

```powershell
npm run editor:subtitle-sync:setup
setx VPF_WORKSPACE_ROOT "D:\OneDrive\VPF-assets"
```

Open a new PowerShell after `setx`, then materialize the project.

```powershell
Set-Location D:\git\video-production-framework-migrated
npm run build
npm run editor:materialize -- pilot_short_roman_ix
```

## Start review

Start the project review API in the first terminal:

```powershell
npm run editor:studio-server -- pilot_short_roman_ix
```

Start Remotion Studio in a second terminal:

```powershell
npm run editor:studio
```

Open the project URL printed by `editor:studio-server`. In the editor choose
`Show panels`, select `Selected`, `From selected`, or `All T1`, and run
`Auto Sync T1 preview`. Review frame deltas and confidence before applying.

`Apply` changes only READY cues as one undoable editor action. LOW_CONFIDENCE,
CONFLICT, and locked cues are not changed. Normal Studio autosave writes the
review draft only; the canonical assembly and `project.db` remain unchanged.
