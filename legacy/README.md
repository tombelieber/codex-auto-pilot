# Legacy compatibility

`auto-pilot/` preserves the v0.14.0 receipt/history implementation and its
contract files unchanged. It is outside the plugin's discoverable `skills/`
directory and is not part of the current guidance workflow.

Keep this snapshot intact: archived receipt validation binds these files.
The CLI retains historical reads and the explicit `--with-local-history`
installation option for users maintaining old receipt-based workflows. These
tools cannot certify the new prose-only workflow as achieved; a missing legacy
receipt is a telemetry limitation, not a blocker for the task.

An upgrade preserves previously opted-in user hooks by installing this snapshot
outside the active skill and redirecting those hooks to it. It preserves history
and active-goal records. New installations do not enable hooks by default.
Do not replace the installed contract during a bound release attempt; finish or
reconcile that attempt before upgrading.
