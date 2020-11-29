//
//  NSURLProtocol+WKWebVIew.h
//  WKWebVIewHybridDemo
//
//  Created by shuoyu liu on 2017/1/15.
//  Copyright © 2017年 shuoyu liu. All rights reserved.
//

#import <Foundation/Foundation.h>

@interface NSURLProtocol (WKWebVIew)

+ (void)wk_registerScheme:(NSString*)scheme;

+ (void)wk_unregisterScheme:(NSString*)scheme;


@end
