import { Buffer } from "buffer";
import { TransactionDoc } from "codechain-indexer-types/lib/types";
import { Type } from "codechain-indexer-types/lib/utils";
import { H256 } from "codechain-sdk/lib/core/classes";
import { Router } from "express";
import * as _ from "lodash";
import moment = require("moment");
import { ServerContext } from "../ServerContext";

function handle(context: ServerContext, router: Router) {
    router.get("/asset-txs/:assetType", async (req, res, next) => {
        const { assetType } = req.params;
        const page = req.query.page && parseInt(req.query.page, 10);
        const itemsPerPage = req.query.itemsPerPage && parseInt(req.query.itemsPerPage, 10);
        try {
            const txs: TransactionDoc[] = await context.db.getTransactionsByAssetType(new H256(assetType), {
                page,
                itemsPerPage
            });
            res.send(txs);
        } catch (e) {
            next(e);
        }
    });

    router.get("/asset-txs/:assetType/totalCount", async (req, res, next) => {
        const { assetType } = req.params;
        try {
            const count = await context.db.getTotalTransactionCountByAssetType(new H256(assetType));
            res.send(JSON.stringify(count));
        } catch (e) {
            next(e);
        }
    });

    router.get("/search/asset/:assetName", async (req, res, next) => {
        const { assetName } = req.params;
        try {
            const assetInfos = await context.db.getAssetInfosByAssetName(assetName);
            res.send(assetInfos);
        } catch (e) {
            next(e);
        }
    });

    router.get("/asset/:assetType", async (req, res, next) => {
        const { assetType } = req.params;
        try {
            if (!Type.isH256String(assetType)) {
                res.send(JSON.stringify(null));
                return;
            }
            let assetScheme = await context.db.getAssetScheme(new H256(assetType));
            if (!assetScheme) {
                assetScheme = await context.db.getPendingAssetScheme(new H256(assetType));
            }
            assetScheme ? res.send(assetScheme) : res.send(JSON.stringify(null));
        } catch (e) {
            next(e);
        }
    });

    router.get("/asset/image/:assetType", async (req, res, next) => {
        const { assetType } = req.params;
        try {
            if (!Type.isH256String(assetType)) {
                res.status(404).send("Not found");
                return;
            }
            const assetImage = await context.db.getAssetImageBlob(new H256(assetType));
            if (!assetImage) {
                res.status(404).send("Not found");
                return;
            }
            const img = Buffer.from(assetImage, "base64");
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": img.length
            });
            res.end(img);
        } catch (e) {
            next(e);
        }
    });

    router.get("/aggs-utxo/:address", async (req, res, next) => {
        const { address } = req.params;
        const { onlyConfirmed, confirmThreshold } = req.query;
        try {
            const bestBlockNumber = await context.db.getLastBlockNumber();
            const utxoList = await context.db.getAggsUTXOList(
                address,
                bestBlockNumber,
                confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                onlyConfirmed === "true"
            );
            const result = await Promise.all(
                _.map(utxoList, async utxo => ({
                    ...utxo,
                    assetScheme: await context.db.getAssetScheme(new H256(utxo.assetType))
                }))
            );
            res.send(result);
        } catch (e) {
            next(e);
        }
    });

    router.get("/aggs-utxo/:address/:assetType", async (req, res, next) => {
        const { address, assetType } = req.params;
        const { onlyConfirmed, confirmThreshold } = req.query;
        try {
            if (!Type.isH256String(assetType)) {
                res.send(JSON.stringify(null));
                return;
            }
            const bestBlockNumber = await context.db.getLastBlockNumber();
            const utxo = await context.db.getAggsUTXOByAssetType(
                address,
                new H256(assetType),
                bestBlockNumber,
                confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                onlyConfirmed === "true"
            );
            if (utxo) {
                const assetScheme = await context.db.getAssetScheme(new H256(utxo.assetType));
                const response = { ...utxo, assetScheme };
                res.send(response);
            } else {
                res.send(JSON.stringify(null));
            }
        } catch (e) {
            next(e);
        }
    });

    // FIXME: This is duplicated with "/utxo/:assetType" action
    router.get("/utxo/:assetType/owner/:address", async (req, res, next) => {
        const { address, assetType } = req.params;
        const { onlyConfirmed, confirmThreshold } = req.query;
        const page = req.query.page && parseInt(req.query.page, 10);
        const itemsPerPage = req.query.itemsPerPage && parseInt(req.query.itemsPerPage, 10);
        const lastBlockNumber = req.query.lastBlockNumber && parseInt(req.query.lastBlockNumber, 10);
        const lastParcelIndex = req.query.lastParcelIndex && parseInt(req.query.lastParcelIndex, 10);
        try {
            let calculatedLastBlockNumber;
            let calculatedLastParcelIndex;
            const bestBlockNumber = await context.db.getLastBlockNumber();
            if (lastBlockNumber && lastParcelIndex) {
                calculatedLastBlockNumber = lastBlockNumber;
                calculatedLastParcelIndex = lastParcelIndex;
            } else if (page === 1 || !page) {
                calculatedLastBlockNumber = Number.MAX_VALUE;
                calculatedLastParcelIndex = Number.MAX_VALUE;
            } else {
                const beforePageAssetCount = (page - 1) * itemsPerPage;
                let currentAssetCount = 0;
                let lastBlockNumberCursor = Number.MAX_VALUE;
                let lastParcelIndexCursor = Number.MAX_VALUE;
                while (beforePageAssetCount - currentAssetCount > 10000) {
                    const cursorAsset = await context.db.getUTXOListByAssetType(
                        new H256(assetType),
                        bestBlockNumber,
                        confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                        onlyConfirmed === "true",
                        {
                            lastBlockNumber: lastBlockNumberCursor,
                            lastParcelIndex: lastParcelIndexCursor,
                            itemsPerPage: 10000,
                            address
                        }
                    );
                    const lastCursorAsset = _.last(cursorAsset);
                    if (lastCursorAsset) {
                        lastBlockNumberCursor = lastCursorAsset.blockNumber;
                        lastParcelIndexCursor = lastCursorAsset.parcelIndex;
                    }
                    currentAssetCount += 10000;
                }
                const skipCount = beforePageAssetCount - currentAssetCount;
                const skipAssets = await context.db.getUTXOListByAssetType(
                    new H256(assetType),
                    bestBlockNumber,
                    confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                    onlyConfirmed === "true",
                    {
                        lastBlockNumber: lastBlockNumberCursor,
                        lastParcelIndex: lastParcelIndexCursor,
                        itemsPerPage: skipCount,
                        address
                    }
                );
                const lastSkipAsset = _.last(skipAssets);
                if (lastSkipAsset) {
                    lastBlockNumberCursor = lastSkipAsset.blockNumber;
                    lastParcelIndexCursor = lastSkipAsset.parcelIndex;
                }
                calculatedLastBlockNumber = lastBlockNumberCursor;
                calculatedLastParcelIndex = lastParcelIndexCursor;
            }
            const assets = await context.db.getUTXOListByAssetType(
                new H256(assetType),
                bestBlockNumber,
                confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                onlyConfirmed === "true",
                {
                    lastBlockNumber: calculatedLastBlockNumber,
                    lastParcelIndex: calculatedLastParcelIndex,
                    itemsPerPage,
                    address
                }
            );

            const result = await Promise.all(
                _.map(assets, async asset => ({
                    ...asset,
                    assetScheme: await context.db.getAssetScheme(new H256(asset.asset.assetType))
                }))
            );
            res.send(result);
        } catch (e) {
            next(e);
        }
    });

    router.get("/utxo/:assetType", async (req, res, next) => {
        const { assetType } = req.params;
        const { onlyConfirmed, confirmThreshold } = req.query;
        const page = req.query.page && parseInt(req.query.page, 10);
        const itemsPerPage = req.query.itemsPerPage && parseInt(req.query.itemsPerPage, 10);
        const lastBlockNumber = req.query.lastBlockNumber && parseInt(req.query.lastBlockNumber, 10);
        const lastParcelIndex = req.query.lastParcelIndex && parseInt(req.query.lastParcelIndex, 10);
        try {
            let calculatedLastBlockNumber;
            let calculatedLastParcelIndex;
            const bestBlockNumber = await context.db.getLastBlockNumber();
            if (lastBlockNumber && lastParcelIndex) {
                calculatedLastBlockNumber = lastBlockNumber;
                calculatedLastParcelIndex = lastParcelIndex;
            } else if (page === 1 || !page) {
                calculatedLastBlockNumber = Number.MAX_VALUE;
                calculatedLastParcelIndex = Number.MAX_VALUE;
            } else {
                const beforePageAssetCount = (page - 1) * itemsPerPage;
                let currentAssetCount = 0;
                let lastBlockNumberCursor = Number.MAX_VALUE;
                let lastParcelIndexCursor = Number.MAX_VALUE;
                while (beforePageAssetCount - currentAssetCount > 10000) {
                    const cursorAsset = await context.db.getUTXOListByAssetType(
                        new H256(assetType),
                        bestBlockNumber,
                        confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                        onlyConfirmed === "true",
                        {
                            lastBlockNumber: lastBlockNumberCursor,
                            lastParcelIndex: lastParcelIndexCursor,
                            itemsPerPage: 10000
                        }
                    );
                    const lastCursorAsset = _.last(cursorAsset);
                    if (lastCursorAsset) {
                        lastBlockNumberCursor = lastCursorAsset.blockNumber;
                        lastParcelIndexCursor = lastCursorAsset.parcelIndex;
                    }
                    currentAssetCount += 10000;
                }
                const skipCount = beforePageAssetCount - currentAssetCount;
                const skipAssets = await context.db.getUTXOListByAssetType(
                    new H256(assetType),
                    bestBlockNumber,
                    confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                    onlyConfirmed === "true",
                    {
                        lastBlockNumber: lastBlockNumberCursor,
                        lastParcelIndex: lastParcelIndexCursor,
                        itemsPerPage: skipCount
                    }
                );
                const lastSkipAsset = _.last(skipAssets);
                if (lastSkipAsset) {
                    lastBlockNumberCursor = lastSkipAsset.blockNumber;
                    lastParcelIndexCursor = lastSkipAsset.parcelIndex;
                }
                calculatedLastBlockNumber = lastBlockNumberCursor;
                calculatedLastParcelIndex = lastParcelIndexCursor;
            }
            const assets = await context.db.getUTXOListByAssetType(
                new H256(assetType),
                bestBlockNumber,
                confirmThreshold != undefined ? parseInt(confirmThreshold, 10) : 5,
                onlyConfirmed === "true",
                {
                    lastBlockNumber: calculatedLastBlockNumber,
                    lastParcelIndex: calculatedLastParcelIndex,
                    itemsPerPage
                }
            );

            const result = await Promise.all(
                _.map(assets, async asset => ({
                    ...asset,
                    assetScheme: await context.db.getAssetScheme(new H256(asset.asset.assetType))
                }))
            );
            res.send(result);
        } catch (e) {
            next(e);
        }
    });

    router.post("/utxo-snapshot/asset/:assetType/date/:date", async (req, res, next) => {
        const { assetType, date } = req.params;
        try {
            if (!moment(date).isValid()) {
                next(new Error("invalid date format"));
                return;
            }

            const unixTimestamp = moment(date).unix();
            const bestBlockNumber = await context.codechainSdk.rpc.chain.getBestBlockNumber();
            const getBestBlock = await context.codechainSdk.rpc.chain.getBlock(bestBlockNumber);
            if (getBestBlock && getBestBlock.timestamp > unixTimestamp) {
                next(new Error("invalid date"));
                return;
            }

            const snapshotId = `assetType-${unixTimestamp}`;
            await context.db.indexSnapshotRequest(snapshotId, new H256(assetType), unixTimestamp);
            res.send({ snapshotId });
        } catch (e) {
            next(e);
        }
    });

    router.get("/utxo-snapshot/requests", async (_R, res, next) => {
        try {
            const snapshotRequests = await context.db.getSnapshotRequests();
            res.send(snapshotRequests);
        } catch (e) {
            next(e);
        }
    });

    router.get("/utxo-snapshot/:snapshotId", async (req, res, next) => {
        const { snapshotId } = req.params;
        try {
            const snapshotResponse = await context.db.getSnapshotUTXOList(snapshotId);
            if (!snapshotResponse) {
                next(new Error("There is no snapshot"));
                return;
            }
            res.send(snapshotResponse);
        } catch (e) {
            next(e);
        }
    });
}

export const AssetAction = {
    handle
};
