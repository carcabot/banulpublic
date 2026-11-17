# Imaginea serverului web. Conține doar Bun și fișierele din web/.
# Datele nu intră în imagine: data/site.db se montează doar pentru citire la /app/data.
FROM docker.io/oven/bun:1.4.0-slim
WORKDIR /app
COPY web/server.ts web/mcp.ts web/limita.ts web/smoke.ts web/
ENV PORT=3210
EXPOSE 3210
USER bun
CMD ["bun", "web/server.ts"]
