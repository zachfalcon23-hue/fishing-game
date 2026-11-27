using UnityEngine;
using UnityEngine.XR;

namespace ChaseDaGoop.GoopFishingVR.Diagnostics
{
    /// <summary>
    /// Lightweight startup diagnostics for a standalone Quest build.
    /// Attach to a bootstrap GameObject in the first VR scene.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class QuestRuntimeDiagnostics : MonoBehaviour
    {
        [SerializeField] private bool logDeviceDetails = true;

        private void Awake()
        {
            Application.targetFrameRate = 72;
            QualitySettings.vSyncCount = 0;
        }

        private void Start()
        {
            LogRuntimeStatus();
        }

        [ContextMenu("Log XR Runtime Status")]
        public void LogRuntimeStatus()
        {
            Debug.Log(
                "[GoopFishingVR] Runtime startup. " +
                "Platform=" + Application.platform +
                ", Device=" + SystemInfo.deviceModel +
                ", Graphics=" + SystemInfo.graphicsDeviceType +
                ", XRActive=" + XRSettings.isDeviceActive,
                this);

            if (!XRSettings.isDeviceActive)
            {
                Debug.LogWarning(
                    "[GoopFishingVR] No active XR display was reported. " +
                    "In Editor this can be expected without an XR runtime; " +
                    "on Quest, verify Android OpenXR provider configuration and device logs.",
                    this);
                return;
            }

            if (logDeviceDetails)
            {
                Debug.Log(
                    "[GoopFishingVR] XRDevice=" + XRDevice.model +
                    ", RefreshRate=" + XRDevice.refreshRate,
                    this);
            }
        }
    }
}
