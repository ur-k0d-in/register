# k0d.in Register

Repository untuk pendaftaran subdomain gratis `namamu.k0d.in`.

## Cara Daftar
1. Fork repository ini.
2. Buat file baru di folder `domains/` dengan nama `subdomainkamu.json`.
3. Isi file dengan format berikut:
```json
{
  "domain": "subdomainkamu",
  "owner": "username-github-kamu",
  "record": {
    "CNAME": "target-url-anda.com"
  }
}
```
4. Buat Pull Request. Robot kami akan memvalidasi otomatis dan mengaktifkan domain kamu jika memenuhi syarat!

## Aturan
- Minimal 3 karakter.
- Maksimal 3 subdomain per akun GitHub.
- Hanya huruf kecil, angka, dan strip (-).
- Kata-kata terlarang tidak diizinkan.
