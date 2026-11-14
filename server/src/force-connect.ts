import 'dotenv/config'
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { encrypt } from './lib/crypto.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const business = await prisma.business.findUnique({ where: { slug: 'meetcoffe' } })
  if (!business) throw new Error('MeetCoffe não encontrada')

  // Criptografa o token de teste para salvar no banco
  const encryptedToken = encrypt(process.env.MP_ACCESS_TOKEN!)

  // Cria ou atualiza a conta do Mercado Pago
  const account = await prisma.businessPaymentAccount.upsert({
    where: { businessId: business.id },
    update: { accessTokenEncrypted: encryptedToken },
    create: {
      businessId: business.id,
      mpUserId: 'TEST_USER',
      accessTokenEncrypted: encryptedToken,
      status: 'ACTIVE',
    },
  })

  // Cria ou atualiza o Terminal Virtual
  await prisma.businessTerminal.upsert({
    where: { id: `${account.id}_NEWLAND` },
    update: {},
    create: {
      id: `${account.id}_NEWLAND`,
      businessId: business.id,
      paymentAccountId: account.id,
      terminalId: 'NEWLAND_N950__SBX0000001',
      operatingMode: 'PDV',
      active: true,
    },
  })

  console.log('✅ Conta de teste e Terminal Virtual conectados com sucesso!')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })