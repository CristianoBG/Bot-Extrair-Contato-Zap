const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const readline = require('readline')
const createCsvWriter = require('csv-writer').createArrayCsvWriter

// Função utilitária: dividir array em chunks de N itens
function chunkArray(array, size) {
    const result = []
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size))
    }
    return result
}

// Validação simples do número
function validarNumero(numero) {
    return /^\+55\d{11}$/.test(numero)
}

// Prompt no terminal
function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise(resolve => rl.question(question, ans => {
        rl.close()
        resolve(ans)
    }))
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({
        auth: state,
        // Remova a linha printQRInTerminal: true
    })

    sock.ev.on('creds.update', saveCreds)

    const { DisconnectReason } = require('@whiskeysockets/baileys')

sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
        console.log('QR Code recebido. Escaneie com seu celular:')
        qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
        console.log('✅ Conectado ao WhatsApp!')
    } else if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
        console.log('⚠️ Conexão fechada, tentando reconectar...', lastDisconnect?.error)
        if (shouldReconnect) {
            start() // chama novamente
        } else {
            console.log("❌ Sessão encerrada, delete a pasta 'auth' e escaneie um novo QR.")
        }
    }
})

    // Aguarda conexão
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Puxa todos os grupos/comunidades
    const chats = await sock.groupFetchAllParticipating()
    const grupos = Object.values(chats)

    console.log(`📦 Encontrados ${grupos.length} grupos/comunidades.`)

    if (!fs.existsSync('./disparos')) fs.mkdirSync('./disparos')

    let continuar = true
    while (continuar) {
        console.log("\n=== LISTA DE GRUPOS ===")
        grupos.forEach((g, idx) => {
            console.log(`${idx + 1} - ${g.subject}`)
        })

        let escolha = await ask("\nDigite o número do grupo que deseja extrair: ")
        let idx = parseInt(escolha) - 1

        if (isNaN(idx) || idx < 0 || idx >= grupos.length) {
            console.log("⚠️ Escolha inválida.")
            continue
        }

        let grupo = grupos[idx]
        console.log(`\n🔍 Extraindo de: ${grupo.subject}`)

        let metadata = await sock.groupMetadata(grupo.id)
        let participantes = metadata.participants.map(p => p.id.split('@')[0])

        // Normaliza +55 e filtra duplicados
        let contatos = [...new Set(participantes.map(n => {
            if (!n.startsWith('+')) n = `+${n}`
            return n
        }))]

        contatos = contatos.filter(validarNumero)

        console.log(`👥 ${contatos.length} contatos válidos encontrados.`)

        // Divide em arquivos de 50
        let partes = chunkArray(contatos, 50)
        partes.forEach((parte, i) => {
            const fileName = `./disparos/${grupo.subject.replace(/\s+/g,'_')}_parte${i+1}.csv`
            const csvWriter = createCsvWriter({
                path: fileName,
                header: false
            })
            csvWriter.writeRecords(parte.map(num => [num]))
                .then(() => console.log(`💾 Salvo: ${fileName}`))
        })

        let resposta = await ask("\nDeseja extrair de outro grupo? (s/n): ")
        if (resposta.toLowerCase() !== 's') {
            continuar = false
            console.log("🚪 Saindo... Extração finalizada.")
        }
    }
}

start()
