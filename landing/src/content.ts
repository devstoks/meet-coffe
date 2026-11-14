/**
 * TODO(cliente): todo o conteúdo editável da landing fica aqui.
 * - Endereço, horários, WhatsApp e Instagram abaixo são PLACEHOLDERS (vieram do HTML-base) — trocar pelos dados reais.
 * - As fotos são do Unsplash (mesmas do protótipo/seed) — trocar por fotos reais do lugar (ver IMAGES).
 * - O cardápio escrito espelha os produtos de exemplo do seed do app; preços e itens devem ser confirmados com a casa.
 */

export const BRAND = {
  name: 'meetcoffe',
  tagline: 'Um encontro de sabores',
}

export const CONTACT = {
  addressLines: ['Rua dos Cafés Especiais, 123', 'Bairro Jardins — São Paulo, SP'],
  mapQuery: 'Rua dos Cafés Especiais, 123, Jardins, São Paulo, SP',
  hours: [
    { days: 'Segunda a Sexta', time: '08h às 20h' },
    { days: 'Sábados e Domingos', time: '09h às 18h' },
  ],
  whatsapp: { label: '(11) 99999-9999', url: 'https://wa.me/5511999999999' },
  instagram: { handle: '@meetcoffe', url: 'https://instagram.com/meetcoffe' },
}

/** URL do cardápio digital (app). Vazio → os botões levam para a aba "Cardápio" da própria landing. */
export const MENU_APP_URL = (import.meta.env.VITE_MENU_URL as string | undefined)?.trim() || ''

const u = (id: string, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`

export const IMAGES = {
  essence: u('photo-1554118811-1e0d58224f24', 900),
  ambient: u('photo-1501339847302-ac426a4a7cbb', 1100),
  gallery: [
    { src: u('photo-1501339847302-ac426a4a7cbb', 1000), alt: 'Interior da cafeteria' },
    { src: u('photo-1495474472287-4d71bcdd2085', 800), alt: 'Mesa com café' },
    { src: u('photo-1445116572660-236099ec97a0', 800), alt: 'Detalhes do ambiente' },
    { src: u('photo-1559525839-b184a4d698c7', 800), alt: 'Café especial' },
    { src: u('photo-1497935586351-b67a49e012bf', 800), alt: 'Cafeteria aconchegante' },
  ],
  local: u('photo-1445116572660-236099ec97a0', 1100),
}

export const MARQUEE = [
  'Cafés especiais',
  'Pão de queijo quentinho',
  'Doces artesanais',
  'Ambiente acolhedor',
  'Cardápio digital via NFC ou QR Code',
  'Um encontro de sabores',
]

export const PILLARS = [
  { icon: 'coffee', title: 'Cafés Especiais', text: 'Grãos selecionados e preparados com técnicas artesanais para extrair o melhor de cada nota.' },
  { icon: 'cookie', title: 'Sabores Únicos', text: 'Uma curadoria gastronômica que mistura clássicos reconfortantes com toques contemporâneos.' },
  { icon: 'heart', title: 'Ambiente Acolhedor', text: 'Luz suave, móveis confortáveis e uma atmosfera que convida a ficar e relaxar.' },
  { icon: 'clock', title: 'Momentos', text: 'Espaço para pausas necessárias, encontros inesperados e memórias afetivas.' },
] as const

export const QUOTE =
  'Acreditamos que os melhores momentos acontecem quando a gente desacelera.'

export const STEPS = [
  { title: 'Encoste o celular ou escaneie o QR', text: 'Cada mesa tem uma tag NFC e um QR Code. Use o que preferir: o cardápio abre na hora, sem baixar nada.' },
  { title: 'Escolha e confirme na mesa', text: 'Monte sua lista e envie o pedido para a cozinha. Para confirmar que você está na mesa, encoste na tag NFC ou leia o QR Code.' },
  { title: 'Acompanhe e feche a conta', text: 'Veja o status do pedido e peça a conta pelo celular, confirmando na mesa do mesmo jeito: NFC ou QR Code.' },
]

export type MenuItem = { name: string; description: string; price: number; image: string }
export type MenuCategory = { id: string; title: string; items: MenuItem[] }

const p = (id: string) => u(id, 700)

export const MENU: MenuCategory[] = [
  {
    id: 'cafe-da-manha',
    title: 'Café da manhã',
    items: [
      { name: 'Morning Ritual', description: 'Panquecas artesanais, frutas frescas da estação e mel natural.', price: 32.9, image: p('photo-1567620905732-2d1ec7ab7445') },
      { name: 'Avocado Toast', description: 'Pão de fermentação natural, avocado cremoso, ovos e azeite extravirgem.', price: 28.9, image: p('photo-1603046891744-1f81b20e7a22') },
      { name: 'Pão de Queijo', description: 'Pão de queijo mineiro quentinho, com casquinha crocante e interior elástico.', price: 12.9, image: p('photo-1599140973792-7df5a94ea1c8') },
      { name: 'Pão na Chapa', description: 'Pão francês na chapa com manteiga derretida, o clássico do café da manhã.', price: 10.9, image: p('photo-1509440159596-0249088772ff') },
    ],
  },
  {
    id: 'almoco',
    title: 'Almoço',
    items: [
      { name: 'Garden Bowl', description: 'Folhas frescas, vegetais selecionados e ingredientes preparados diariamente.', price: 39.9, image: p('photo-1512621776951-a57141f2eefd') },
      { name: 'Pasta della Casa', description: 'Massa com molho cremoso, ervas frescas e ingredientes selecionados.', price: 46.9, image: p('photo-1621996346565-e3dbc646d9a9') },
      { name: 'Escondidinho de Carne Seca', description: 'Carne seca desfiada, purê de mandioca cremoso e queijo gratinado.', price: 52.9, image: p('photo-1543339494-b4cd4f7ba686') },
    ],
  },
  {
    id: 'lanches',
    title: 'Lanches',
    items: [
      { name: 'Maison Burger', description: 'Blend artesanal, queijo especial, pão brioche e molho exclusivo.', price: 42.9, image: p('photo-1568901346375-23c9450c58cd') },
      { name: 'Coxinha de Frango', description: 'Coxinha de frango desfiado com massa leve e empanada crocante.', price: 14.9, image: p('photo-1626082927389-6cd097cee6a6') },
    ],
  },
  {
    id: 'bebidas',
    title: 'Bebidas',
    items: [
      { name: 'Iced Coffee', description: 'Espresso especial, leite cremoso e gelo.', price: 18.9, image: p('photo-1517701604599-bb29b565090c') },
      { name: 'Suco de Maracujá', description: 'Suco natural de maracujá batido na hora com gelo e hortelã.', price: 16.9, image: p('photo-1613478223719-2ab802602423') },
    ],
  },
  {
    id: 'sobremesas',
    title: 'Sobremesas',
    items: [
      { name: 'Bolo de Cenoura', description: 'Fatia generosa de bolo de cenoura fofinho com cobertura de chocolate meio amargo.', price: 15.9, image: p('photo-1578985545062-69928b1d9587') },
      { name: 'Brigadeiro Gourmet', description: 'Brigadeiro feito com chocolate belga e granulado fino.', price: 8.9, image: p('photo-1548907040-4baa42d10919') },
      { name: 'Berry Cheesecake', description: 'Cheesecake artesanal com base crocante e calda de frutas vermelhas.', price: 22.9, image: p('photo-1533134242443-d4fd215305ad') },
      { name: 'Açaí na Tigela', description: 'Açaí batido na hora, acompanhado de banana, granola artesanal e leite condensado.', price: 26.9, image: p('photo-1590301157890-4810ed352733') },
      { name: 'Tapioca de Coco', description: 'Tapioca recheada com queijo minas derretido e coco fresco.', price: 18.9, image: p('photo-1626200419199-391ae4be7a41') },
    ],
  },
]

export const formatPrice = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
