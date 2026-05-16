INSERT INTO tenants (
  tenant_key,
  display_name,
  vkn_tckn,
  address,
  integrator_driver,
  integrator_credentials,
  api_key_hash,
  webhook_secret,
  tax_profile,
  mode,
  created_at,
  updated_at
) VALUES (
  'sportoonline',
  'Sportoonline Spor Malzemeleri',
  '1234567890',
  'İstanbul, Türkiye',
  'nilvera',
  '{{INTEGRATOR_CREDENTIALS}}',
  '{{API_KEY_HASH}}',
  '{{WEBHOOK_SECRET}}',
  '{"default_vat_rate": 20, "exemptions": [], "withholding": null}',
  'test',
  NOW(3),
  NOW(3)
);
