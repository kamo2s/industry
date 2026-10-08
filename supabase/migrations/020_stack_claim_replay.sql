-- Replay only Stack's verified manual claim skipped by the old event tag.
-- Existing receipt and journal idempotency keys prevent duplicate credits.
UPDATE pump_scan_signatures SET processed=false,error=NULL
WHERE signature='5vXXCEFivHTPyMs1hYcfWJgwVEcqHutKYVbfFeEsoF1EwYtEraAhMWQaEestdH5qBaAcEt5RWFwAurSJMEpqzdG7'
AND business_id IN (SELECT business_id FROM pump_businesses WHERE mint='DheynVQthaZtBF1yMVZXxVW5w3tseSBm5Ef1h5buKCCi');
UPDATE pump_businesses SET next_collection_at=now()+interval '2 minutes'
WHERE mint='DheynVQthaZtBF1yMVZXxVW5w3tseSBm5Ef1h5buKCCi';
