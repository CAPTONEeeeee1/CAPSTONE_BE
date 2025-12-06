const { prisma } = require('../shared/prisma');
const querystring = require('qs');
const crypto = require('crypto');
const moment = require('moment');

// Function from VNPAY demo to sort object properties for signing
function sortObject(obj) {
	let sorted = {};
	let str = [];
	let key;
	for (key in obj){
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
		str.push(encodeURIComponent(key));
		}
	}
	str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
    }
    return sorted;
}

async function createVNPayPayment(req, res) {
    // TODO: The schema has been updated. Please run the following command to create and apply the migration:
    // npx prisma migrate dev --name add_user_to_payment

    process.env.TZ = 'Asia/Ho_Chi_Minh';

    const userId = req.user.id;
    const { amount, orderInfo, workspaceId } = req.body; 

    if (!amount || !orderInfo || !workspaceId) {
        return res.status(400).json({ error: 'Missing required payment information: amount, orderInfo, or workspaceId.' });
    }

    try {
        // 1. Authorization: Check if user is part of the workspace
        const workspaceMember = await prisma.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: workspaceId,
                    userId: userId,
                },
            },
        });

        if (!workspaceMember) {
            return res.status(403).json({ error: 'Forbidden: You are not a member of this workspace.' });
        }

        // 2. Create Payment Record in DB
        const orderId = moment().format('DDHHmmss');
        await prisma.payment.create({
            data: {
                orderId: orderId,
                workspaceId: workspaceId,
                userId: userId, // Link payment to user
                amount: amount,
                status: 'PENDING',
            },
        });

        // 3. Create VNPAY URL (manual implementation)
        const date = new Date();
        const createDate = moment(date).format('YYYYMMDDHHmmss');
        const ipAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';

        const tmnCode = process.env.VNPAY_TMNCODE;
        const secretKey = process.env.VNPAY_HASHSECRET;
        let vnpUrl = process.env.VNPAY_URL;
        const returnUrl = process.env.VNPAY_RETURN_URL;
        
        const amountValue = parseInt(amount, 10);
        if (isNaN(amountValue)) {
            return res.status(400).json({ error: 'Invalid amount format.' });
        }
        
        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        vnp_Params['vnp_Locale'] = 'vn';
        vnp_Params['vnp_CurrCode'] = 'VND';
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = 'Upgrade to Premium Plan for workspace ' + workspaceId;
        vnp_Params['vnp_OrderType'] = 'billpayment';
        vnp_Params['vnp_Amount'] = amountValue; // Use the parsed amount directly
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_CreateDate'] = createDate;
        
        vnp_Params = sortObject(vnp_Params);

        const signData = querystring.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        vnp_Params['vnp_SecureHash'] = signed;
        
        vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

        res.json({ paymentUrl: vnpUrl });

    } catch (error) {
        console.error('[BE] Error creating VNPay payment:', error);
        res.status(500).json({ 
            error: 'Failed to create VNPay payment', 
            details: error.message 
        });
    }
}


async function vnpayReturn(req, res) {
    try {
        let vnp_Params = req.query;
        const secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        
        const secretKey = process.env.VNPAY_HASHSECRET;
        const signData = querystring.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");

        const orderId = vnp_Params['vnp_TxnRef'];
        const amount = parseFloat(vnp_Params['vnp_Amount']) / 100;
        const responseCode = vnp_Params['vnp_ResponseCode'];

        if (secureHash === signed) {
            const payment = await prisma.payment.findUnique({
                where: { orderId: orderId },
            });

            if (responseCode === '00') {
                // SUCCESS
                console.log(`VNPay Payment Return Successful: Order ID - ${orderId}, Amount - ${amount}`);

                if (payment && payment.status === 'PENDING') {
                    await prisma.$transaction(async (tx) => {
                        await tx.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: 'SUCCESS',
                                transactionNo: vnp_Params['vnp_TransactionNo'],
                            },
                        });

                        await tx.workspace.update({
                            where: { id: payment.workspaceId },
                            data: {
                                plan: 'PREMIUM',
                                planExpiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                            },
                        });
                        console.log(`Workspace ${payment.workspaceId} upgraded to PREMIUM.`);
                    });
                } else {
                    console.log(`Payment for Order ID ${orderId} was already processed or not found.`);
                }

                res.redirect(`${process.env.FRONTEND_URL}/payment-status?success=true&orderId=${orderId}&amount=${amount}`);
            } else {
                // FAILED/CANCELLED
                if (payment && payment.status === 'PENDING') {
                    await prisma.payment.update({
                        where: { id: payment.id },
                        data: { status: 'FAILED' },
                    });
                }
                console.log(`VNPay Payment Return Failed: Order ID - ${orderId}, Response Code - ${responseCode}`);
                res.redirect(`${process.env.FRONTEND_URL}/payment-status?success=false&message=Payment failed or cancelled`);
            }
        } else {
            // INVALID SIGNATURE
            console.error('Invalid SecureHash for VNPay return URL');
            res.redirect(`${process.env.FRONTEND_URL}/payment-status?success=false&message=Invalid payment signature`);
        }
    } catch (error) {
        console.error('Error processing VNPay return:', error);
        res.redirect(`${process.env.FRONTEND_URL}/payment-status?success=false&message=An error occurred during payment processing.`);
    }
}


async function vnpayIpn(req, res) {
    try {
        let vnp_Params = req.query;
        const secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        const secretKey = process.env.VNPAY_HASHSECRET;
        const signData = querystring.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        
        const orderId = vnp_Params['vnp_TxnRef'];
        const rspCode = vnp_Params['vnp_ResponseCode'];
        const transactionNo = vnp_Params['vnp_TransactionNo'];
        const vnpAmount = parseFloat(vnp_Params['vnp_Amount']) / 100;

        if (secureHash === signed) {
            const payment = await prisma.payment.findUnique({
                where: { orderId: orderId },
            });

            if (!payment) {
                return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
            }

            // Check if amount matches
            if (payment.amount !== vnpAmount) {
                return res.status(200).json({ RspCode: '04', Message: 'Invalid amount' });
            }

            if (payment.status !== 'PENDING') {
                return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
            }

            if (rspCode === '00') {
                await prisma.$transaction(async (tx) => {
                    await tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: 'SUCCESS',
                            transactionNo: transactionNo,
                        },
                    });

                    await tx.workspace.update({
                        where: { id: payment.workspaceId },
                        data: {
                            plan: 'PREMIUM',
                            planExpiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                        },
                    });
                });
                res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
            } else {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: 'FAILED' },
                });
                // As per VNPAY docs, still return success to acknowledge IPN.
                res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
            }
        } else {
            res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Error processing VNPay IPN:', error);
        res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
}


module.exports = {
    createVNPayPayment,
    vnpayReturn,
    vnpayIpn,
};