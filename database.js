const { pg, sequelize } = require("config");
const _ = require("lodash");

const config = _.assign({}, pg, { username: pg.user }, sequelize);
const mode = process.env.NODE_ENV || "dev";

module.exports[mode] = config;
