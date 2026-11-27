# Goop Fishing VR — M1 Foundation

**Target:** Meta Quest 3S  
**Engine:** Unity 6.3 (6000.3 LTS line)  
**XR:** OpenXR + Unity OpenXR: Meta  
**Interaction:** XR Interaction Toolkit 3.3.2  
**Render pipeline:** URP  
**Status:** Project scaffold committed; Unity Editor import, scene wiring, Android build, and physical-headset validation remain to be performed.

## Important repository boundary

This project is currently staged under `VR/GoopFishingVR` on the isolated `vr/m1-unity-foundation` branch of the browser game repository. It is not merged into `main`. Move this folder into a new `goop-fishing-vr` repository before the first production release. The browser version remains authoritative and untouched.

## Open in Unity

1. Install Unity Hub and a Unity 6.3 LTS editor patch.
2. Include Android Build Support, Android SDK & NDK Tools, and OpenJDK in the Unity installation.
3. Open this folder as a Unity project.
4. Allow Package Manager to resolve `Packages/manifest.json`.
5. In Package Manager, select XR Interaction Toolkit and import its **Starter Assets** sample.
6. Create a VR scene using the XR Origin / Action-based Controller setup from Starter Assets. Do not hand-create action maps with guessed bindings.
7. Add `QuestRuntimeDiagnostics` to a bootstrap GameObject and `ControllerPresenceProbe` to a diagnostics GameObject.
8. In Project Settings, enable OpenXR for Android and enable the Meta Quest support feature(s) required by the installed OpenXR Meta package.
9. Switch Build Profile / Build Settings to Android, set ARM64, and verify the minimum API level and graphics settings against the current Meta Quest requirements.
10. Build and install to a physical Quest 3S using Android Debug Bridge or Build And Run.

Unity's XR packages provide OpenXR device support, XR Origin, controller interaction, locomotion, and Input System integration. The Starter Assets sample is the preferred starting point for the first rig rather than maintaining hand-written controller bindings.

## M1 acceptance checklist

- [ ] Unity opens the project and resolves every package without errors.
- [ ] A scene contains an XR Origin, tracked HMD camera, left/right controller objects, and an XR Interaction Manager.
- [ ] Android OpenXR is enabled and Meta Quest features are configured.
- [ ] Android ARM64 build completes.
- [ ] APK installs and launches on Quest 3S.
- [ ] Head tracking is live and stable.
- [ ] Both controllers are detected and tracked.
- [ ] No recurring XR initialization errors appear in the device log.
- [ ] A short physical-headset test confirms comfort and stable frame pacing.

**Do not mark M1 complete from an Editor Play-mode test alone.** The APK must be installed and exercised on the actual Quest 3S.

## Current limitations

The repository scaffold does not include a generated Unity scene, imported Starter Assets, a built APK, or a headset test result. Those require Unity Editor, Android build tools, and physical Quest hardware. The scripts committed here are runtime diagnostics, not a substitute for XR rig configuration.
