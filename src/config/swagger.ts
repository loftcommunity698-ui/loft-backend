import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Loft Community API",
      version: "1.0.0",
      description: "REST API for the Loft Community job platform",
    },
    servers: [{ url: "/api" }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "auth-token",
        },
      },
      schemas: {
        Job: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            company: { type: "string" },
            companyLogo: { type: "string", nullable: true },
            location: { type: "string" },
            remote: { type: "boolean", default: false },
            salaryMin: { type: "integer", nullable: true },
            salaryMax: { type: "integer", nullable: true },
            currency: { type: "string", default: "USD" },
            tags: { type: "array", items: { type: "string" } },
            category: { type: "string" },
            seniority: { type: "string" },
            description: { type: "string" },
            requirements: { type: "array", items: { type: "string" } },
            responsibilities: { type: "array", items: { type: "string" } },
            postedDate: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            featured: { type: "boolean", default: false },
            employerId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: { "200": { description: "OK" }, "503": { description: "Database unavailable" } },
        },
      },
      "/api/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "List jobs (with search & pagination)",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "seniority", in: "query", schema: { type: "string" } },
            { name: "remote", in: "query", schema: { type: "string", enum: ["true", "false"] } },
            { name: "salaryMin", in: "query", schema: { type: "integer" } },
            { name: "salaryMax", in: "query", schema: { type: "integer" } },
            { name: "featured", in: "query", schema: { type: "string", enum: ["true", "false"] } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["relevance", "recent", "salary_high", "salary_low", "remote_first"], default: "recent" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "take", in: "query", schema: { type: "integer", default: 12 } },
          ],
          responses: { "200": { description: "Job list" } },
        },
        post: {
          tags: ["Jobs"],
          summary: "Create a job",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["title", "company", "location", "category", "seniority", "description"],
              properties: {
                title: { type: "string" },
                company: { type: "string" },
                companyLogo: { type: "string" },
                location: { type: "string" },
                remote: { type: "boolean" },
                salaryMin: { type: "integer" },
                salaryMax: { type: "integer" },
                currency: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                category: { type: "string" },
                seniority: { type: "string" },
                description: { type: "string" },
                requirements: { type: "array", items: { type: "string" } },
                responsibilities: { type: "array", items: { type: "string" } },
              },
            }}},
          },
          responses: { "201": { description: "Job created" } },
        },
      },
      "/api/jobs/tags/search": {
        get: {
          tags: ["Jobs"],
          summary: "Search job tags with counts",
          parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Matching tags with counts" } },
        },
      },
      "/api/jobs/facets": {
        get: {
          tags: ["Jobs"],
          summary: "Job facet buckets (categories, seniorities, locations, remote)",
          responses: { "200": { description: "Facet buckets" } },
        },
      },
      "/api/jobs/{id}": {
        get: {
          tags: ["Jobs"],
          summary: "Get job by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Job details" }, "404": { description: "Not found" } },
        },
        patch: {
          tags: ["Jobs"],
          summary: "Update job",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Job updated" }, "404": { description: "Not found" } },
        },
        delete: {
          tags: ["Jobs"],
          summary: "Delete job",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Job deleted" }, "404": { description: "Not found" } },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
