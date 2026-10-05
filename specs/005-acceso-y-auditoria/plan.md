# Plan: acceso, privacidad y auditoría

## Implementación

Migración `20261005130000_door_access_audit_privacy.sql`: código público de Event con 256 bits, permisos independientes por evento, RPC de puerta autorizadas, vista pública sin PII, fecha de revocación y guardas contra borrado de Tickets por cascada. CSV de auditoría separado y restringido al owner. La UI asigna/retira permiso a cuentas verificadas existentes.

## Verificación

SQL y HTTP verifican owner/staff/otro evento, RLS, revocación inmediata, privacidad, exclusión operativa y conservación de auditoría. Playwright verifica asignación desde el panel, correo→confirmación→QR y vistas desktop/mobile.

## Constitution Check

V: identificadores aleatorios no enumerables, vista pública sin nombre/email, puerta independiente y revocadas preservadas. I: spec previa y migración versionada. Evidencia ejecutada en `verification.md`.
