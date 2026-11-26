# [XS] Try and promote live captions

## Goal

Live captions are tried on real WebGPU hardware and announced.

## Plan

Turn on Settings → Live Captions in a room on a WebGPU browser (Chrome or Edge
on macOS or Windows), speak, and watch a second participant's tile. Captions
should trail the speech by about a second; a device that can't keep up stops
with "this device transcribes too slowly". Try a non-English spoken language to
see the English translation track and the "Show captions in" picker.

## Waiting

- Maintainer (PC): try live captions on a WebGPU machine as the Plan describes,
  then announce them. An agent can't: the hosts it drives have no hardware
  WebGPU adapter, so it validated only on SwiftShader, which transcribes about
  35 s behind.
