import { SignedTransaction } from "codechain-sdk/lib/core/classes";
import { Transaction } from "sequelize";
import models from "..";
import { AssetTypeLogInstance } from "../assetTypeLog";
import { strip0xPrefix } from "./utils/format";
import { getTracker } from "./utils/transaction";

export async function createAssetTypeLog(
    transaction: SignedTransaction,
    assetType: string,
    options: { transaction?: Transaction } = {}
): Promise<AssetTypeLogInstance> {
    return models.AssetTypeLog.create(
        {
            transactionHash: transaction.hash().value,
            transactionTracker: getTracker(transaction),
            transactionType: transaction.unsigned.type(),
            blockNumber: transaction.blockNumber,
            transactionIndex: transaction.transactionIndex,
            isPending: transaction.blockNumber == null,
            assetType: strip0xPrefix(assetType)
        },
        {
            transaction: options.transaction
        }
    );
}

export async function updateAssetTypeLog(
    tx: SignedTransaction,
    options: { transaction?: Transaction } = {}
): Promise<void> {
    return models.AssetTypeLog.update(
        {
            blockNumber: tx.blockNumber,
            transactionIndex: tx.transactionIndex,
            isPending: false
        },
        {
            where: {
                transactionHash: tx.hash().value
            },
            returning: false,
            transaction: options.transaction
        }
    ).then(() => {
        return;
    });
}
