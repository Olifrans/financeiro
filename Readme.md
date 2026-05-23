



Para gerar uma JWT_SECRET segura:

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Cole o resultado no .env. Nunca use senhas fracas ou valores hardcoded em produçã