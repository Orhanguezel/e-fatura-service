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
  'uYmEVEeyUbJBQhtQ.qCAclfMTJiOz/8tuDih7WA==.KX2LMPdiPIKA2ET46PXBNnw0HnWdynOTnkVMtxA=',
  '4cb5e4b2a4b97224f330f9aa974fbe4dfdc46b0e00ec35bfcf4bf2d21460b931',
  'IuG0BiGBwyUJOzgh.yg3wCmjjQ6d66UEvXtcgMQ==.d4KpksLDGUcrXcWtQk0CO9j5BA==',
  '{"default_tax_rate": 20}',
  'test',
  NOW(3),
  NOW(3)
);
