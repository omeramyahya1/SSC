
BEGIN
  INSERT INTO notification_jobs(
					  event_type,
            recipient_user_id,
            recipient_role,
            payload,
            status
  )
   VALUES (
   'password_change_verification',
    NEW.user_id,
    NEW.role,
    json_build_object(
      'verification_code', NEW.verification_code,
      'expires_at', NEW.expires_at
    ),
    'pending'
  );
  RETURN NEW;
END;
