# M1 implementation notes

## Why the first scene is not generated in code

XR Origin and controller action bindings are package-versioned prefab/configuration assets. Generating a plausible-looking scene YAML or guessing the Input Action references would create a fragile project. Import the XR Interaction Toolkit Starter Assets sample using Package Manager and configure the scene from the matching installed package version.

## Package baseline

The manifest is aligned to Unity 6.3 (6000.3) released package versions:

- Input System 1.20.1
- Universal Render Pipeline 17.3.0
- XR Interaction Toolkit 3.3.2
- XR Plug-in Management 4.6.1
- Unity OpenXR: Meta 2.7.0
- OpenXR Plugin 1.16.1

If Unity reports a package compatibility conflict, do not blindly upgrade individual packages. Resolve the set as a compatible Unity 6.3 package group and commit the resulting manifest and lock file together.

## Frame-rate policy

72 FPS is the initial target for the first Quest test, not a hard-coded product-wide refresh-rate lock. After profiling on Quest 3S, evaluate 80/90 Hz and supported device refresh modes. The runtime diagnostic script sets a conservative initial target; it must be revisited once XR runtime refresh negotiation is configured.

## Security and source boundaries

Do not copy secrets, local save files, user data, or credentials into the Unity project. Browser save import/export is out of scope for M1.
