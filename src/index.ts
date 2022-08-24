import { Probot } from "probot";
import { MD5 } from "crypto-js";
import { Contract, ethers } from "ethers";
import { OpenSourceTokenAbi } from "./contracts/OpenSourceTokenAbi";
import abi = require('../abis/OpenSourceToken.abi.json');

const commands = require('probot-commands')

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    var owner = "0xD7C91D12c9Ace617eC2F2B20803dB8E166585baE";

    var fundingPoolId = MD5(JSON.stringify({
      context: 'GitHub',
      repositoryId: context.payload.repository.id,
      issueNumber: context.payload.issue.number
    }));

    var urlSvg = "http://80.180.105.139:3001";
    var urlFunder = `http://80.180.105.139:4200/web3/funding/${owner}/${fundingPoolId}?ref=${context.payload.issue.html_url}`;

    const issueComment = context.issue({
      body: `[![alt text](${urlSvg}/?owner=${owner}&fundingPoolId=${fundingPoolId})](${urlFunder})`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  commands(app, 'claim', async (context: any, command: any) => {
		const provider = new ethers.providers.JsonRpcProvider("https://zksync2-testnet.zksync.dev");

    const signer = new ethers.Wallet("0x6d6352f3144cc7a9ba24d6f7b603baf05cc556d5bb2de494c39ed473db50f074", provider);

		var contract = new Contract(
      "0x745c8671B6A6bDE6FB74Ee04D93bBB643E6cd4B5",
      abi,
      signer
		) as OpenSourceTokenAbi;

    var query = `{
      repository(name: "my-first-app", owner: "Loodd") {
        pullRequest(number: ${context.payload.issue.number}) {
          closingIssuesReferences(first: 100) {
            nodes {
              number
            }
          }
        }
      }
    }`;

    const labels = command.arguments.split(/, */);

    context.octokit.graphql(query).then(async (data: any) => {
      for (var node of data.repository.pullRequest.closingIssuesReferences.nodes) {
        var fundingPoolId = MD5(JSON.stringify({
          context: 'GitHub',
          repositoryId: context.payload.repository.id,
          issueNumber: node.number
        }));

        let changeTx = await contract.approveFund(fundingPoolId.toString(), labels[0]);

        await changeTx.wait();
      }
    });

    const issueComment = context.issue({
      body: `Addres: ${JSON.stringify(labels)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
