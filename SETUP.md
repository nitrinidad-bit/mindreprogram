# MindReprogram - Guia de Deploy en Railway

## Paso 1: Crear Bot de Telegram

1. Abre Telegram y busca **@BotFather**
2. Envia `/newbot`
3. Nombre: `MindReprogram Bot`
4. Username: `mindreprogram_bot` (o el que este disponible)
5. Copia el **token** que te da (ejemplo: `7123456789:AAHxxx...`)
6. Envia `/setdescription` → selecciona tu bot → escribe la descripcion
7. Envia `/setcommands` → selecciona tu bot → pega esto:

```
start - Iniciar y vincular cuenta
meditar - Recibir meditacion recomendada
categorias - Ver categorias disponibles
progreso - Ver estadisticas y progreso
suscribir - Ver planes de suscripcion
vincular - Vincular cuenta con token
ayuda - Mostrar ayuda
```

## Paso 2: Crear cuenta Stripe (modo test)

1. Ve a https://dashboard.stripe.com/register
2. NO actives el modo live, quédate en **Test Mode**
3. Ve a **Products** → Create Product:
   - **Basico**: $9.99/mes recurring
   - **Premium**: $19.99/mes recurring
   - **Pro**: $39.99/mes recurring
4. Copia cada **Price ID** (empieza con `price_`)
5. Ve a **Developers** → **API Keys** → copia el **Secret Key** (empieza con `sk_test_`)
6. Ve a **Developers** → **Webhooks** → Add endpoint:
   - URL: `https://TU-APP.railway.app/api/payments/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
   - Copia el **Signing Secret** (empieza con `whsec_`)

## Paso 3: Preparar audios en Google Drive

1. Sube tus audios MP3 de meditacion a Google Drive
2. Click derecho en cada archivo → **Compartir** → **Cualquier persona con el enlace**
3. Copia el ID del archivo del URL:
   `https://drive.google.com/file/d/ESTE_ES_EL_ID/view`
4. El link directo sera:
   `https://drive.google.com/uc?id=ESTE_ES_EL_ID&export=download`

## Paso 4: Subir codigo a GitHub

```bash
cd Documents/mindreprogram
git init
git add .
git commit -m "Initial commit: MindReprogram meditation platform"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mindreprogram.git
git push -u origin main
```

## Paso 5: Deploy en Railway

1. Ve a https://railway.com y crea cuenta (con GitHub)
2. Click **New Project** → **Deploy from GitHub repo**
3. Selecciona `mindreprogram`
4. Railway detecta Node.js automaticamente

### Agregar PostgreSQL:
5. En tu proyecto Railway, click **+ New** → **Database** → **PostgreSQL**
6. Railway conecta la BD automaticamente via `DATABASE_URL`

### Configurar variables de entorno:
7. Click en tu servicio → **Variables** → **Raw Editor** y pega:

```
NODE_ENV=production
JWT_SECRET=genera-un-string-aleatorio-largo-aqui
JWT_REFRESH_SECRET=genera-otro-string-aleatorio-diferente
STORAGE_MODE=gdrive
TELEGRAM_BOT_TOKEN=tu-token-de-botfather
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_BASIC_PRICE_ID=price_xxxxx
STRIPE_PREMIUM_PRICE_ID=price_xxxxx
STRIPE_PRO_PRICE_ID=price_xxxxx
APP_URL=https://TU-APP.railway.app
FRONTEND_URL=https://TU-APP.railway.app
```

### Inicializar base de datos:
8. En Railway, ve a tu servicio PostgreSQL → **Data** → **Query**
9. Copia y pega el contenido de `src/database/schema.sql` y ejecuta
10. Luego copia y pega `src/database/seed.sql` y ejecuta

## Paso 6: Probar

### Verificar que el servidor esta arriba:
```
curl https://TU-APP.railway.app/health
```

### Registrar usuario de prueba:
```bash
curl -X POST https://TU-APP.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tester@test.com","password":"Test1234!","fullName":"Tester MindReprogram"}'
```

### Agregar meditacion con Google Drive:
```bash
curl -X POST https://TU-APP.railway.app/api/admin/meditations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -d '{
    "title": "Respiracion Consciente - Nivel 1",
    "description": "5 minutos de respiracion para calmar la mente",
    "category": "anxiety",
    "durationMinutes": 5,
    "unlockLevel": 1,
    "minTier": "basic",
    "audioUrl": "https://drive.google.com/uc?id=TU_FILE_ID&export=download",
    "neuralTarget": "alpha",
    "tags": ["respiracion", "calma", "principiante"],
    "publishNow": true
  }'
```

### Probar en Telegram:
1. Busca tu bot en Telegram
2. Envia `/start`
3. Genera token: usa la API con el token JWT del admin
4. Envia `/vincular TU_TOKEN` en el bot
5. Envia `/meditar` para recibir una meditacion

## Paso 7: Darle acceso al tester

Envia a tu tester:
1. El link del bot de Telegram: `t.me/TU_BOT_USERNAME`
2. Un link de registro o credenciales de prueba
3. Un token de vinculacion pre-generado

## Tarjetas de prueba Stripe

- Pago exitoso: `4242 4242 4242 4242`
- Fecha: cualquier fecha futura
- CVC: cualquier 3 digitos
- ZIP: cualquier 5 digitos
