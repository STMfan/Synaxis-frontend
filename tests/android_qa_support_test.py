"""Device helpers must not silently operate on an attached personal phone."""

import os
import unittest
from unittest.mock import patch

from android_qa_support import AndroidDevice


class AndroidDeviceTests(unittest.TestCase):
    def test_a_device_must_be_selected_explicitly_before_resolving_or_running_adb(self):
        with patch.dict(os.environ, {}, clear=True), patch("android_qa_support.adb_executable") as executable:
            with self.assertRaisesRegex(ValueError, "ANDROID_SERIAL"):
                AndroidDevice()
            executable.assert_not_called()

    def test_every_command_targets_the_selected_device_without_a_shell(self):
        with patch("android_qa_support.adb_executable", return_value="adb"), patch("android_qa_support.subprocess.check_output", return_value=b"test") as command:
            device = AndroidDevice(serial="explicit-test-device")
            device.adb("get-state")
            command.assert_called_once()
            self.assertEqual(command.call_args.args[0], ["adb", "-s", "explicit-test-device", "get-state"])
            self.assertNotIn("shell", command.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
