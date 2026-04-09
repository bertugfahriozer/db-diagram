# VS Code Extension Yayınlama Rehberi

Bu rehber, **DB Diagram — Visual Database Designer** eklentisini hem Visual Studio Marketplace hem de Open VSX Registry üzerinde nasıl yayınlayacağınızı adım adım açıklar.

## 1. Hazırlık Adımları

Yayınlama işleminden önce `package.json` dosyanızdaki şu alanların doğruluğundan emin olun:
- `publisher`: `bertug` (Marketplace'teki yayıncı adınızla eşleşmeli)
- `version`: `2.0.0` (Her yeni yayında bu numarayı artırmalısınız)
- `icon`: Eklentiniz için bir ikon eklemek isterseniz `package.json`'a ekleyin.

Terminalde gerekli araçları yükleyin:
```bash
npm install -g @vscode/vsce ovsx
```

---

## 2. Visual Studio Marketplace (Microsoft)

### Adım 1: Azure DevOps ve PAT (Personal Access Token) Oluşturma
1. [Azure DevOps](https://dev.azure.com/) hesabınıza giriş yapın.
2. Sağ üstten **User Settings** -> **Personal Access Tokens** yolunu izleyin.
3. **New Token** oluşturun:
   - **Name:** `vsce-publisher`
   - **Organization:** `All accessible organizations`
   - **Scopes:** `Custom defined` -> **Marketplace** altındaki **Manage** yetkisini seçin.
4. Token'ı kopyalayın ve güvenli bir yere kaydedin.

### Adım 2: Yayıncı (Publisher) Oluşturma
1. [Marketplace Management Console](https://marketplace.visualstudio.com/manage) sayfasına gidin.
2. `bertug` adında bir yayıncı oluşturun (eğer henüz yoksa).

### Adım 3: Giriş Yapma ve Yayınlama
Terminalden:
```bash
# Giriş yapın (PAT token isteyecektir)
vsce login bertug

# Eklentiyi paketleyin (.vsix dosyası oluşturur)
vsce package

# Eklentiyi yayınlayın
vsce publish
```

---

## 3. Open VSX Registry (Eclipse Foundation)

Open VSX, VSCodium gibi açık kaynaklı editörler tarafından kullanılır.

### Adım 1: Hesap ve Token
1. [Open VSX Registry](https://open-vsx.org/) adresine gidin ve GitHub/GitLab ile giriş yapın.
2. Profil ayarlarınızdan bir **Access Token** oluşturun.

### Adım 2: Yayınlama
Open VSX için ayrı bir paketleme yapmanıza gerek yoktur, `vsce` ile oluşturduğunuz `.vsix` dosyasını kullanabilirsiniz.

```bash
# Giriş yapın
ovsx login bertug --token <SENIN_TOKENIN>

# Yayınlayın
ovsx publish db-diagram-2.0.0.vsix
```

---

## 4. Kritik Kontroller
- **Linter Hataları:** `npm run compile` komutunun hatasız çalıştığından emin olun.
- **README & LICENSE:** Eklentinizin market sayfasında düzgün görünmesi için `README.md` ve `LICENSE.md` dosyalarının eksiksiz olması şarttır (zaten bunları tamamladık).
- **CHANGELOG:** Her sürümde yapılan değişiklikleri belirten bir `CHANGELOG.md` dosyası eklemeniz profesyonel bir görünüm sağlar.

## 💡 İpucu
Her seferinde manuel komut girmek yerine `package.json` dosyanıza şu script'i ekleyebilirsiniz:
```json
"release": "vsce publish && ovsx publish"
```
Ardından sadece `npm run release` diyerek her iki yere de gönderebilirsiniz.
