import * as bodyParser from "body-parser";
import * as express from "express";
import swaggerJSDoc = require("swagger-jsdoc");
import * as swaggerUi from "swagger-ui-express";
import { createApiRouter } from "./api";
import { IndexerContext } from "./context";
import log from "./log";

// Swagger definition
// You can set every attribute except paths and swagger
// https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md
const swaggerDefinition = {
    info: {
        title: "CodeChain Indexer API",
        version: "1.0.0"
    },
    host: "localhost:3000",
    basePath: "/"
};

// Options for the swagger docs
const options = {
    // Import swaggerDefinitions
    swaggerDefinition,
    // Path to the API docs
    apis: ["src/routers/*.ts"]
};

// Initialize swagger-jsdoc -> returns validated swagger spec in json format
const swaggerSpec = swaggerJSDoc(options);

export function createServer(context: IndexerContext) {
    const app = express();

    // Enable reverse proxy support in Express. This causes the
    // the "X-Forwarded-Proto" header field to be trusted so its
    // value can be used to determine the protocol. See
    // http://expressjs.com/api#app-settings for more details.
    app.enable("trust proxy");
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
        bodyParser.json({
            type: () => true // Treat all other content types as application/json
        })
    );

    if (process.env.NODE_ENV === "dev") {
        app.use(
            "/api-docs",
            swaggerUi.serve,
            swaggerUi.setup(swaggerSpec, { explorer: true })
        );
    }

    app.use("/api", createApiRouter(context, true));
    app.use(handleErrors);

    return app;
}

const handleErrors: express.ErrorRequestHandler = (err, _R, res, next) => {
    if (err.status >= 400 && err.status < 500) {
        return res.status(err.status).send(err.statusText);
    }

    log.error(err);
    next(err);
};
