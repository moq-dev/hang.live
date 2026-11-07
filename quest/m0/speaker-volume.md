# [S] Preserve supported speaker gain across reloads and mute

## Goal

A speaker gain accepted by the volume control survives reload, and muting then
unmuting restores the user's chosen gain.

## Plan

Confirmed in `app/src/settings.tsx`: the persisted volume validator resets values
above 1 to 1, while the speaker control in `app/src/controls.tsx` allows
up to 2. Align validation with the supported UI range using one shared definition,
and continue rejecting non-finite and invalid stored values.

Inspect the zero-volume handler: it currently stores gain 1 while disabling audio.
Preserve the last nonzero gain separately from mute if necessary so the mute
control and slider agree. Test a gain above unity across reload, invalid storage,
and mute/unmute without needing a live media stream.

This is a settings fix; leave codec gain and spatial mixing in their existing
layers. The AFK request authorizes the recommended m0 scope and priority.
