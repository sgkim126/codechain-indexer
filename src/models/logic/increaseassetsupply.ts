import { H160 } from "codechain-primitives/lib";
import { AssetMintOutput } from "codechain-sdk/lib/core/transaction/AssetMintOutput";
import {
    IncreaseAssetSupply,
    IncreaseAssetSupplyActionJSON
} from "codechain-sdk/lib/core/transaction/IncreaseAssetSupply";
import { IncreaseAssetSupplyInstance } from "../increaseAssetSupply";
import models from "../index";
import { getOwner } from "./utils/address";
import { strip0xPrefix } from "./utils/format";

export async function createIncreaseAssetSupply(
    transactionHash: string,
    increaseAssetSupply: IncreaseAssetSupply
): Promise<IncreaseAssetSupplyInstance> {
    const { networkId, action } = increaseAssetSupply.toJSON();
    const {
        shardId,
        assetType,
        output,
        approvals
    } = action as IncreaseAssetSupplyActionJSON;

    const incSupplyOutput = AssetMintOutput.fromJSON(output);
    const { lockScriptHash, parameters } = output;
    const supply = incSupplyOutput.supply!.toString(10);
    const recipient = getOwner(new H160(lockScriptHash), parameters, networkId);
    const inst = await models.IncreaseAssetSupply.create({
        transactionHash: strip0xPrefix(transactionHash),
        networkId,
        shardId,
        assetType: strip0xPrefix(assetType),
        approvals,
        lockScriptHash: strip0xPrefix(lockScriptHash),
        parameters: parameters.map(p => strip0xPrefix(p)),
        recipient,
        supply
    });
    return inst;
}