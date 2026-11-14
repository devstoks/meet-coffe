import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const business = await prisma.business.upsert({
    where: { slug: 'meetcoffe' },
    update: { googleReviewUrl: 'https://share.google/fXrbZxPlqiZcftLBi' },
    create: {
      name: 'MeetCoffe',
      slug: 'meetcoffe',
      description: 'Um encontro de sabores.',
      whatsapp: '+5511999999999',
      instagram: '@meetcoffe',
      googleReviewUrl: 'https://share.google/fXrbZxPlqiZcftLBi',
    },
  })

  // Mesas
  for (let i = 1; i <= 16; i++) {
    const number = String(i).padStart(2, '0')
    await prisma.cafeTable.upsert({
      where: { nfcPublicId: `M${number}` },
      update: {},
      create: {
        businessId: business.id,
        number,
        nfcPublicId: `M${number}`,
        qrIdentifier: `QR-M${number}-${business.slug}`,
        status: 'AVAILABLE',
      },
    })
  }

  // Admin users
  const adminHash = await bcrypt.hash('admin123', 10)
  const staffHash = await bcrypt.hash('fun123', 10)

  await prisma.adminUser.upsert({
    where: { email: 'admin@meetcoffe.com' },
    update: { passwordHash: adminHash },
    create: {
      businessId: business.id,
      name: 'Admin MeetCoffe',
      email: 'admin@meetcoffe.com',
      passwordHash: adminHash,
      role: 'ADMIN',
      active: true,
    },
  })

  await prisma.adminUser.upsert({
    where: { email: 'fun@meetcoffe.com' },
    update: { passwordHash: staffHash },
    create: {
      businessId: business.id,
      name: 'Funcionário MeetCoffe',
      email: 'fun@meetcoffe.com',
      passwordHash: staffHash,
      role: 'STAFF',
      active: true,
    },
  })

  // Produtos
  const productCount = await prisma.product.count({
    where: { businessId: business.id },
  })

  if (productCount === 0) {
    const products = [
      // CAFÉ DA MANHÃ
      {
        name: 'Morning Ritual',
        description: 'Panquecas artesanais, frutas frescas da estação e mel natural.',
        price: 32.9,
        category: 'Café da manhã',
        imagePath: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Avocado Toast',
        description: 'Pão de fermentação natural, avocado cremoso, ovos e azeite extravirgem.',
        price: 28.9,
        category: 'Café da manhã',
        imagePath: 'https://images.unsplash.com/photo-1603046891744-1f81b20e7a22?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Pão de Queijo',
        description: 'Pão de queijo mineiro quentinho, com casquinha crocante e interior elástico.',
        price: 12.9,
        category: 'Café da manhã',
        imagePath: 'https://images.unsplash.com/photo-1599140973792-7df5a94ea1c8?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Pão na Chapa',
        description: 'Pão francês na chapa com manteiga derretida, o clássico do café da manhã.',
        price: 10.9,
        category: 'Café da manhã',
        imagePath: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1400&q=90',
      },
      
      // ALMOÇO
      {
        name: 'Garden Bowl',
        description: 'Folhas frescas, vegetais selecionados e ingredientes preparados diariamente.',
        price: 39.9,
        category: 'Almoço',
        imagePath: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Pasta della Casa',
        description: 'Massa com molho cremoso, ervas frescas e ingredientes selecionados.',
        price: 46.9,
        category: 'Almoço',
        imagePath: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Escondidinho de Carne Seca',
        description: 'Carne seca desfiada, purê de mandioca cremoso e queijo gratinado.',
        price: 52.9,
        category: 'Almoço',
        imagePath: 'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?auto=format&fit=crop&w=1400&q=90',
      },

      // LANCHES
      {
        name: 'Maison Burger',
        description: 'Blend artesanal, queijo especial, pão brioche e molho exclusivo.',
        price: 42.9,
        category: 'Lanches',
        imagePath: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Coxinha de Frango',
        description: 'Coxinha de frango desfiado com massa leve e empanada crocante.',
        price: 14.9,
        category: 'Lanches',
        imagePath: 'https://images.unsplash.com/photo-1626082927389-6cd097cee6a6?auto=format&fit=crop&w=1400&q=90',
      },

      // BEBIDAS
      {
        name: 'Iced Coffee',
        description: 'Espresso especial, leite cremoso e gelo.',
        price: 18.9,
        category: 'Bebidas',
        imagePath: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Suco de Maracujá',
        description: 'Suco natural de maracujá batido na hora com gelo e hortelã.',
        price: 16.9,
        category: 'Bebidas',
        imagePath: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1400&q=90',
      },

      // SOBREMESAS
      {
        name: 'Bolo de Cenoura',
        description: 'Fatia generosa de bolo de cenoura fofinho com cobertura de chocolate meio amargo.',
        price: 15.9,
        category: 'Sobremesas',
        imagePath: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Brigadeiro Gourmet',
        description: 'Brigadeiro feito com chocolate belga e granulado fino.',
        price: 8.9,
        category: 'Sobremesas',
        imagePath: 'https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Berry Cheesecake',
        description: 'Cheesecake artesanal com base crocante e calda de frutas vermelhas.',
        price: 22.9,
        category: 'Sobremesas',
        imagePath: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Açaí na Tigela',
        description: 'Açaí batido na hora, acompanhado de banana, granola artesanal e leite condensado.',
        price: 26.9,
        category: 'Sobremesas',
        imagePath: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1400&q=90',
      },
      {
        name: 'Tapioca de Coco',
        description: 'Tapioca recheada com queijo minas derretido e coco fresco.',
        price: 18.9,
        category: 'Sobremesas',
        imagePath: 'https://images.unsplash.com/photo-1626200419199-391ae4be7a41?auto=format&fit=crop&w=1400&q=90',
      },
    ]

    for (const p of products) {
      await prisma.product.create({
        data: {
          businessId: business.id,
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          imagePath: p.imagePath,
          active: true,
        },
      })
    }
  }

  console.log('Seed concluído com cardápio brasileiro completo.')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })