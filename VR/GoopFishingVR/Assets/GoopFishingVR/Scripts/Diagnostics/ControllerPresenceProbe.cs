using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace ChaseDaGoop.GoopFishingVR.Diagnostics
{
    /// <summary>
    /// Reports controller devices discovered by Unity's XR Input subsystem.
    /// This is a diagnostic probe; gameplay input will be routed through
    /// Input System actions and XR Interaction Toolkit.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class ControllerPresenceProbe : MonoBehaviour
    {
        [SerializeField, Min(0.5f)] private float pollIntervalSeconds = 3f;

        private readonly List<InputDevice> devices = new List<InputDevice>();
        private float nextPollTime;

        private void Update()
        {
            if (Time.unscaledTime < nextPollTime)
                return;

            nextPollTime = Time.unscaledTime + pollIntervalSeconds;
            ReportControllers();
        }

        [ContextMenu("Report XR Controllers")]
        public void ReportControllers()
        {
            devices.Clear();

            InputDevices.GetDevicesWithCharacteristics(
                InputDeviceCharacteristics.Controller,
                devices);

            if (devices.Count == 0)
            {
                Debug.LogWarning(
                    "[GoopFishingVR] No XR controller devices currently detected.",
                    this);
                return;
            }

            foreach (InputDevice device in devices)
            {
                Debug.Log(
                    "[GoopFishingVR] Controller detected: " +
                    device.name +
                    " | Characteristics=" + device.characteristics +
                    " | Valid=" + device.isValid,
                    this);
            }
        }
    }
}
