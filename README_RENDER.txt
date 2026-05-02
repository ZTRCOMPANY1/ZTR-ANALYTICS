ZTR Analytics - pronto para Render

1) Suba esta pasta para um repositório no GitHub.

2) No Render:
   New + > Web Service > escolha o repositório.

3) Configuração:
   Build Command: npm install
   Start Command: npm start

4) Variáveis de ambiente recomendadas:
   ADMIN_PASSWORD=troque_essa_senha
   ALLOWED_ORIGINS=https://ztrcompany.site,https://www.ztrcompany.site

5) Depois do deploy, o Render vai gerar uma URL parecida com:
   https://ztr-analytics-server.onrender.com

6) Abra essa URL, crie seu site no painel e copie o tracker gerado.
   Ele vai ficar assim:
   <script src="https://SEU-SERVICO.onrender.com/tracker.js" data-site-id="ID" data-api="https://SEU-SERVICO.onrender.com"></script>

7) Cole o tracker antes do </body> em todas as páginas HTML que quer monitorar.

Obs: usando JSON local, os dados podem resetar se o serviço for recriado/redeployado sem disco persistente.
