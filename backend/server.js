const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const PDFDocument = require("pdfkit");

const app = express();

app.use(express.json());
app.use(cors());

// Configuração dos caminhos estáticos
let frontendPath = path.join(__dirname, "../frontend");
if (!fs.existsSync(frontendPath)) {
  frontendPath = fs.existsSync(path.join(__dirname, "public"))
    ? path.join(__dirname, "public")
    : path.join(__dirname, "../");
}

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  const indexPath = path.join(frontendPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send("API do Sistema Hospitalar está rodando!");
  }
});

// Banco de dados em memória
const db = {
  usuarios: [
    { usuario: "admin", senha: "123", tipo: "atendimento" },
    { usuario: "atendimento", senha: "123", tipo: "atendimento" },
    { usuario: "triagem", senha: "123", tipo: "triagem" },
    { usuario: "medico", senha: "123", tipo: "medico" }
  ],
  pacientes: [],
  triagens: [],
  consultas: [],
  tv_chamada: null,
  tv_historico: []
};

// LOGIN
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;
  const user = db.usuarios.find(u => u.usuario === usuario && u.senha === senha);

  if (!user) {
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  }

  res.json({ usuario: user.usuario, tipo: user.tipo });
});

// ATENDIMENTO
app.post("/atendimento", (req, res) => {
  const paciente = {
    id: Date.now(),
    nome: req.body.nome,
    cpf: req.body.cpf,
    dataNascimento: req.body.dataNascimento,
    idade: req.body.idade,
    responsavel: req.body.responsavel,
    tipo: req.body.tipo,
    status: "triagem",
    createdAt: new Date()
  };

  db.pacientes.push(paciente);
  res.json(paciente);
});

app.get("/pacientes", (req, res) => {
  res.json(db.pacientes);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  try {
    const { pacienteId, nome, sintoma, temperatura, alergia, observacao } = req.body;

    let risco = req.body.risco;
    if (temperatura >= 39) {
      risco = "vermelho";
    } else if (temperatura >= 38) {
      risco = "amarelo";
    } else if (!risco) {
      risco = "verde";
    }

    if (pacienteId) {
      const paciente = db.pacientes.find(p => String(p.id) === String(pacienteId));
      if (paciente) {
        paciente.status = "medico";
      }
    }

    const triagem = {
      id: Date.now(),
      pacienteId,
      nome,
      sintoma,
      temperatura,
      alergia,
      observacao,
      risco,
      status: "aguardando_medico",
      createdAt: new Date()
    };

    db.triagens.push(triagem);
    res.json(triagem);
  } catch (error) {
    res.status(500).json({ erro: "Erro ao processar triagem." });
  }
});

app.get("/triagens", (req, res) => {
  res.json(db.triagens);
});

// TV - CHAMADAS
app.post("/tv/chamar", (req, res) => {
  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo,
    localNumero: req.body.localNumero,
    paciente: req.body.paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  if (db.tv_historico.length > 5) db.tv_historico.pop();

  res.json(chamada);
});

app.get("/tv/chamada", (req, res) => {
  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona", "Paracetamol", "Ibuprofeno", "Amoxicilina",
    "Azitromicina", "Loratadina", "Omeprazol", "Buscopan", "Dramin", "Soro fisiológico"
  ]);
});

// CONSULTA
app.post("/consulta", (req, res) => {
  const { triagemId, paciente, diagnostico, medicacao, obs } = req.body;

  if (triagemId) {
    const triagem = db.triagens.find(t => String(t.id) === String(triagemId));
    if (triagem) {
      triagem.status = "finalizado";
    }
  }

  const consulta = {
    id: Date.now(),
    triagemId,
    paciente,
    diagnostico,
    medicacao,
    obs,
    createdAt: new Date()
  };

  db.consultas.push(consulta);
  res.json(consulta);
});

app.get("/medicacoes", (req, res) => {
  res.json(db.consultas);
});

// GERAR PDF DA ALTA (USANDO PDFKIT VIA BUFFER)
app.post("/gerar-pdf-alta", (req, res) => {
  try {
    const { paciente, sintoma, temperatura, alergia, diagnostico, medicacao, obs } = req.body;
    const dataAtual = new Date().toLocaleDateString("pt-BR");

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    let buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", pdfData.length);
      res.setHeader("Content-Disposition", "inline; filename=alta_medica.pdf");
      res.status(200).send(pdfData);
    });

    // Conteúdo do PDF
    doc.fontSize(18).fillColor("#1a365d").text("🏥 HOSPITAL SENTINELA", { align: "left" });
    doc.fontSize(9).fillColor("#4a5568").text("Sistema de Gestão Hospitalar e Prontuário Eletrônico", { align: "left" });
    doc.fontSize(9).fillColor("#718096").text(`Data de Emissão: ${dataAtual}`, { align: "right" });
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#2b6cb0").lineWidth(2).stroke();
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor("#2b6cb0").text("TERMO DE ALTA MÉDICA", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11).fillColor("#1a365d").text("IDENTIFICAÇÃO DO PACIENTE");
    doc.fontSize(10).fillColor("#2d3748");
    doc.text(`Paciente: ${paciente || "Não informado"}`);
    doc.text(`Sintoma: ${sintoma || "—"}`);
    doc.text(`Temperatura: ${temperatura ? temperatura + " °C" : "—"}`);
    doc.text(`Alergias: ${alergia || "Nenhuma"}`);
    doc.moveDown(1.5);

    doc.fontSize(11).fillColor("#1a365d").text("DIAGNÓSTICO E CONDUTA MÉDICA");
    doc.fontSize(10).fillColor("#2d3748");
    doc.text(`Diagnóstico: ${diagnostico || "—"}`);
    doc.text(`Medicação Prescrita: ${medicacao || "Nenhuma"}`);
    doc.moveDown(1.5);

    doc.fontSize(11).fillColor("#1a365d").text("OBSERVAÇÕES E ORIENTAÇÕES");
    doc.fontSize(10).fillColor("#2d3748").text(obs || "Paciente liberado com orientações gerais de repouso.", { align: "justify" });
    doc.moveDown(4);

    const posY = doc.y;
    doc.moveTo(170, posY).lineTo(425, posY).strokeColor("#4a5568").lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#1a365d").text("Dr. Médico Responsável", { align: "center" });
    doc.fontSize(9).fillColor("#718096").text("CRM/UF 123456 • Medicina de Emergência", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("Erro interno no PDF:", error);
    res.status(500).send("Erro interno ao processar PDF: " + error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
