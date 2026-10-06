'use client';
import type {Agent} from '../../../packages/core';
import {CoinPortrait} from './coin-portrait';
import {safeCoinImageUrl,trustedCoinThumbnail} from '../../../packages/core/coin-images';
export function BusinessPortrait({business,size=42}:{business:Pick<Agent,'id'|'name'|'ticker'|'icon_url'|'token'>&{visibility?:string};size?:number}){
 const stored=trustedCoinThumbnail(business.icon_url),src=business.visibility==='private'?stored:(business.token||!stored&&safeCoinImageUrl(business.icon_url))?'/api/network/images/'+business.id:stored;
 return <CoinPortrait name={business.name} ticker={business.ticker} src={src} size={size}/>;
}
